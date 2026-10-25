// The rollout: who gets texted, when, and what happens on booking, cancellation and close.
import { and, eq, gt, inArray, lte, ne, asc, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { schema } from "@/db";
import { describeSlots, insideTextingHours, jobSlots, local, nextTextingTime, fmtTime, fmtStamp, money } from "@/lib/time";
import {
  Ctx, Job, Offer, Provider, ScheduledEvent, alertParents, cancelEvents, log, schedule, textProvider, texting,
} from "./context";
import { T } from "./texts";

const { jobs, offers, providers, awayDates, scheduledEvents } = schema;
const HOUR = 3600_000;
export const TIER_COUNT = 3;

export async function getJob(ctx: Ctx, id: number): Promise<Job> {
  const [j] = await ctx.db.select().from(jobs).where(eq(jobs.id, id));
  if (!j) throw new Error(`Job ${id} not found`);
  return j;
}

export async function jobOffers(ctx: Ctx, jobId: number) {
  return ctx.db
    .select({ offer: offers, provider: providers })
    .from(offers)
    .innerJoin(providers, eq(offers.providerId, providers.id))
    .where(eq(offers.jobId, jobId))
    .orderBy(asc(offers.sentAt), asc(offers.id));
}

/** Urgent jobs (starting within 12 hours) ignore texting hours. */
function urgent(ctx: Ctx, job: Job) {
  return job.startsAt.getTime() - ctx.now.getTime() < 12 * HOUR;
}

/** When a text to a sitter about this job may go out, at or after `at`. */
export function sitterSendTime(ctx: Ctx, job: Job, at: Date) {
  if (job.allowAnyHour) return at;
  if (job.startsAt.getTime() - at.getTime() < 12 * HOUR) return at;
  return nextTextingTime(at, texting(ctx));
}

export type Candidate = { provider: Provider; usual: boolean; missing: string[] };

/**
 * Sitters in the given tiers who could be offered this job and haven't been yet.
 * Excludes people who haven't joined, opted out, are away, or are booked at an overlapping time.
 */
export async function candidates(ctx: Ctx, job: Job, tiers: number[]): Promise<{ ok: Candidate[]; skipped: { provider: Provider; reason: string }[] }> {
  const list = await ctx.db.select().from(providers)
    .where(and(eq(providers.active, true), inArray(providers.tier, tiers)))
    .orderBy(asc(providers.tier), asc(providers.name));
  const already = new Set((await ctx.db.select({ p: offers.providerId }).from(offers).where(eq(offers.jobId, job.id))).map((r) => r.p));
  const tz = ctx.hh.timezone;
  const jobDate = local(job.startsAt, tz).toISODate()!;
  const away = await ctx.db.select().from(awayDates)
    .where(and(lte(awayDates.startDate, jobDate), sql`${awayDates.endDate} >= ${jobDate}`));
  const awayIds = new Set(away.map((a) => a.providerId));
  // Sitters booked on another job that overlaps this one.
  const busy = await ctx.db.select({ p: offers.providerId }).from(offers)
    .innerJoin(jobs, eq(offers.jobId, jobs.id))
    .where(and(eq(jobs.status, "booked"), eq(offers.reply, "yes"), ne(jobs.id, job.id),
      sql`${jobs.startsAt} < ${job.endsAt}`, sql`${jobs.endsAt} > ${job.startsAt}`));
  const busyIds = new Set(busy.map((b) => b.p));
  const needed = jobSlots(job.startsAt, job.endsAt, tz);

  const ok: Candidate[] = [];
  const skipped: { provider: Provider; reason: string }[] = [];
  for (const p of list) {
    if (already.has(p.id)) continue;
    if (!p.joined) { skipped.push({ provider: p, reason: "hasn't texted JOIN yet" }); continue; }
    if (p.optedOut) { skipped.push({ provider: p, reason: "opted out of texts" }); continue; }
    if (awayIds.has(p.id)) { skipped.push({ provider: p, reason: "away that day" }); continue; }
    if (busyIds.has(p.id)) { skipped.push({ provider: p, reason: "booked on another job then" }); continue; }
    const missing = needed.filter((k) => !p.availability.includes(k));
    ok.push({ provider: p, usual: missing.length === 0, missing });
  }
  return { ok, skipped };
}

/** Offers this sitter could currently answer (used to decide whether to show job letters). */
export async function liveOfferCount(ctx: Ctx, providerId: number) {
  const rows = await ctx.db.select({ id: offers.id }).from(offers).innerJoin(jobs, eq(offers.jobId, jobs.id))
    .where(and(eq(offers.providerId, providerId), inArray(jobs.status, ["open", "booked"]), gt(jobs.startsAt, ctx.now),
      ne(offers.reply, "dropped"), ne(offers.reply, "no")));
  return rows.length;
}

async function offerTo(ctx: Ctx, job: Job, c: Candidate, tier: number, unusual: boolean) {
  const rate = job.rateCents ?? c.provider.rateCents;
  await ctx.db.insert(offers).values({
    jobId: job.id, providerId: c.provider.id, tier, rateCents: rate, outsideUsual: unusual, sentAt: ctx.now,
  });
  const showCode = (await liveOfferCount(ctx, c.provider.id)) > 1;
  await textProvider(ctx, c.provider, T.offer(ctx.hh, job, rate, showCode, unusual ? describeSlots(c.missing) : undefined), job.id);
}

const nameRate = (c: Candidate, job: Job) => {
  const r = money(job.rateCents ?? c.provider.rateCents);
  return r ? `${c.provider.name} (${r})` : c.provider.name;
};

async function assignCode(ctx: Ctx): Promise<string> {
  const used = new Set((await ctx.db.select({ c: jobs.code }).from(jobs)
    .where(and(inArray(jobs.status, ["open", "booked", "closed"]), gt(jobs.endsAt, ctx.now)))).map((r) => r.c));
  for (const ch of "ABCDEFGHJKLMNPQRSTUVWXYZ") if (!used.has(ch)) return ch;
  return "Z";
}

/** Parent pressed Send. */
export async function sendJob(ctx: Ctx, jobId: number) {
  const job = await getJob(ctx, jobId);
  if (job.status !== "draft") return;
  const code = await assignCode(ctx);
  await ctx.db.update(jobs).set({ status: "open", sentAt: ctx.now, code }).where(eq(jobs.id, jobId));
  const at = sitterSendTime(ctx, job, ctx.now);
  await log(ctx, jobId, "you", "Job created and sent",
    at > ctx.now ? `Outside texting hours, so Tier 1 waits until ${fmtStamp(at, ctx.hh.timezone)}` : null);
  await schedule(ctx, jobId, "send_tier", at, { tier: 1 });
  await scheduleClose(ctx, job);
  await runDue(ctx);
}

async function scheduleClose(ctx: Ctx, job: Job) {
  const closeAt = new Date(job.startsAt.getTime() - job.closeBeforeHours * HOUR);
  await cancelEvents(ctx, job.id, ["close"]);
  if (closeAt > ctx.now) await schedule(ctx, job.id, "close", closeAt);
}

/** Schedule whatever comes after the last tier sent. */
async function scheduleNextStep(ctx: Ctx, job: Job, from: Date, immediate = false) {
  if (job.tierSent < TIER_COUNT) {
    const next = job.tierSent + 1;
    const wait = immediate ? 0 : (job.tierWaits[next - 2] ?? 24) * HOUR;
    await schedule(ctx, job.id, "send_tier", new Date(from.getTime() + wait), { tier: next });
  } else if (job.unavailableMode === "end" && !job.unavailableAsked) {
    const { ok } = await candidates(ctx, job, [1, 2, 3]);
    if (ok.some((c) => !c.usual)) {
      await schedule(ctx, job.id, "ask_unavailable", new Date(from.getTime() + (immediate ? 0 : job.unavailableWaitHours * HOUR)));
    }
  }
}

async function scheduleReminder(ctx: Ctx, job: Job) {
  if (job.remindersSent >= job.remindMax || job.remindEveryHours <= 0) return;
  await cancelEvents(ctx, job.id, ["remind"]);
  await schedule(ctx, job.id, "remind", new Date(ctx.now.getTime() + job.remindEveryHours * HOUR));
}

// ---------- Event handlers ----------

async function onSendTier(ctx: Ctx, job: Job, tier: number) {
  if (job.status !== "open" || tier <= job.tierSent) return;
  const { ok, skipped } = await candidates(ctx, job, [tier]);
  const send = ok.filter((c) => c.usual || job.unavailableMode === "start");
  const held = ok.filter((c) => !c.usual && job.unavailableMode !== "start");
  for (const c of send) await offerTo(ctx, job, c, tier, !c.usual);
  await ctx.db.update(jobs).set({ tierSent: tier }).where(eq(jobs.id, job.id));
  job.tierSent = tier;

  const notes: string[] = [];
  for (const c of held) {
    notes.push(`${c.provider.name} ${job.unavailableMode === "end" ? "held for the end" : "not asked"}: not usually free ${describeSlots(c.missing)}`);
  }
  for (const s of skipped) notes.push(`${s.provider.name} skipped: ${s.reason}`);
  await log(ctx, job.id, "sent",
    send.length ? `Tier ${tier} texted: ${send.map((c) => nameRate(c, job)).join(", ")}` : `Tier ${tier}: no one to text`,
    notes.join(" · ") || null);

  await scheduleNextStep(ctx, job, ctx.now, send.length === 0);
  if (tier === 1 && send.length) await scheduleReminder(ctx, job);
}

async function onAskUnavailable(ctx: Ctx, job: Job) {
  if (job.status !== "open" || job.unavailableAsked) return;
  const { ok } = await candidates(ctx, job, [1, 2, 3]);
  const list = ok.filter((c) => !c.usual);
  for (const c of list) await offerTo(ctx, job, c, c.provider.tier, true);
  await ctx.db.update(jobs).set({ unavailableAsked: true }).where(eq(jobs.id, job.id));
  await log(ctx, job.id, "sent", list.length
    ? `Asked "just in case": ${list.map((c) => nameRate(c, job)).join(", ")}`
    : "No usually-unavailable sitters left to ask", list.length ? "Not usually free at this time" : null);
}

async function onRemind(ctx: Ctx, job: Job) {
  if (job.status !== "open") return;
  // Skip anyone texted about this job in the last 2 hours (e.g. a tier that just went out).
  const recent = ctx.now.getTime() - 2 * HOUR;
  const rows = (await jobOffers(ctx, job.id)).filter((r) =>
    ["none", "maybe", "backup"].includes(r.offer.reply) && r.offer.sentAt.getTime() <= recent);
  for (const r of rows) {
    const showCode = (await liveOfferCount(ctx, r.provider.id)) > 1;
    await textProvider(ctx, r.provider, T.reminder(ctx.hh, job, showCode), job.id);
  }
  await ctx.db.update(jobs).set({ remindersSent: job.remindersSent + 1 }).where(eq(jobs.id, job.id));
  job.remindersSent += 1;
  if (rows.length) await log(ctx, job.id, "reminder", `Reminder to ${rows.map((r) => r.provider.name).join(", ")}`);
  await scheduleReminder(ctx, job);
}

export function headStartMinutes(ctx: Ctx, job: Job) {
  const minsLeft = (job.startsAt.getTime() - ctx.now.getTime()) / 60000;
  return Math.max(10, Math.min(job.headStartMinutes, Math.floor(minsLeft / 4)));
}

async function onHeadStart(ctx: Ctx, job: Job) {
  if (job.status !== "open") return;
  const backups = (await jobOffers(ctx, job.id)).filter((r) => r.offer.reply === "backup");
  const until = new Date(ctx.now.getTime() + headStartMinutes(ctx, job) * 60000);
  for (const b of backups) await textProvider(ctx, b.provider, T.headStart(ctx.hh, job, until), job.id);
  await log(ctx, job.id, "sent", `Backups texted: ${backups.map((b) => b.provider.name).join(", ")}`,
    `First dibs until ${fmtTime(until, ctx.hh.timezone)}`);
  await schedule(ctx, job.id, "head_start_end", until);
}

async function onHeadStartEnd(ctx: Ctx, job: Job) {
  if (job.status !== "open") return;
  const rows = (await jobOffers(ctx, job.id)).filter((r) => ["none", "maybe"].includes(r.offer.reply));
  for (const r of rows) {
    const showCode = (await liveOfferCount(ctx, r.provider.id)) > 1;
    await textProvider(ctx, r.provider, T.reopened(ctx.hh, job, showCode), job.id);
  }
  await log(ctx, job.id, "sent",
    rows.length ? `Reopened to everyone who didn't say no: ${rows.map((r) => r.provider.name).join(", ")}` : "No one else to re-text yet",
    "Recruiting picks up where it left off");
  await scheduleNextStep(ctx, job, ctx.now);
  await scheduleReminder(ctx, job);
}

async function onClose(ctx: Ctx, job: Job) {
  if (job.status !== "open") return;
  await ctx.db.update(jobs).set({ status: "closed" }).where(eq(jobs.id, job.id));
  await cancelEvents(ctx, job.id);
  const maybes = (await jobOffers(ctx, job.id)).filter((r) => r.offer.reply === "maybe");
  for (const m of maybes) await textProvider(ctx, m.provider, T.closedToMaybe(ctx.hh, job), job.id);
  await log(ctx, job.id, "closed", "Stopped offering: nobody claimed it in time",
    `Parents texted${maybes.length ? ` · "No longer needed" sent to ${maybes.map((m) => m.provider.name).join(", ")}` : ""}`);
  await alertParents(ctx, T.pClosed(ctx.hh, job), job.id);
}

async function onDayReminder(ctx: Ctx, job: Job) {
  if (job.status !== "booked" || !job.bookedOfferId) return;
  const [r] = await ctx.db.select({ provider: providers }).from(offers).innerJoin(providers, eq(offers.providerId, providers.id))
    .where(eq(offers.id, job.bookedOfferId));
  if (!r) return;
  await textProvider(ctx, r.provider, T.dayReminder(ctx.hh, job, ctx.now), job.id);
  await log(ctx, job.id, "reminder", `Day-of reminder to ${r.provider.name}`);
}

const SITTER_FACING = new Set(["send_tier", "ask_unavailable", "remind", "head_start", "head_start_end", "day_reminder"]);

async function runEvent(ctx: Ctx, ev: ScheduledEvent) {
  const job = await getJob(ctx, ev.jobId);
  if (job.paused && ev.type !== "close" && ev.type !== "day_reminder") return "wait" as const;
  if (SITTER_FACING.has(ev.type)) {
    const ok = ev.type === "day_reminder" || job.allowAnyHour || urgent(ctx, job) || insideTextingHours(ctx.now, texting(ctx));
    if (!ok) return nextTextingTime(ctx.now, texting(ctx));
  }
  switch (ev.type) {
    case "send_tier": await onSendTier(ctx, job, Number(ev.payload.tier)); break;
    case "ask_unavailable": await onAskUnavailable(ctx, job); break;
    case "remind": await onRemind(ctx, job); break;
    case "head_start": await onHeadStart(ctx, job); break;
    case "head_start_end": await onHeadStartEnd(ctx, job); break;
    case "close": await onClose(ctx, job); break;
    case "day_reminder": await onDayReminder(ctx, job); break;
  }
  return "done" as const;
}

/** Run every event that's due. Safe to call often; each event is claimed before it runs. */
export async function runDue(ctx: Ctx) {
  for (let guard = 0; guard < 200; guard++) {
    const [ev] = await ctx.db.select().from(scheduledEvents)
      .where(and(eq(scheduledEvents.status, "pending"), lte(scheduledEvents.runAt, ctx.now)))
      .orderBy(asc(scheduledEvents.runAt), asc(scheduledEvents.id)).limit(1);
    if (!ev) return;
    const claimed = await ctx.db.update(scheduledEvents).set({ status: "running" })
      .where(and(eq(scheduledEvents.id, ev.id), eq(scheduledEvents.status, "pending"))).returning();
    if (!claimed.length) continue;
    try {
      const r = await runEvent(ctx, ev);
      if (r === "wait") {
        // Paused: check again in 5 minutes.
        await ctx.db.update(scheduledEvents).set({ status: "pending", runAt: new Date(ctx.now.getTime() + 5 * 60000) }).where(eq(scheduledEvents.id, ev.id));
      } else if (r instanceof Date) {
        await ctx.db.update(scheduledEvents).set({ status: "pending", runAt: r }).where(eq(scheduledEvents.id, ev.id));
      } else {
        await ctx.db.update(scheduledEvents).set({ status: "done", doneAt: ctx.now }).where(eq(scheduledEvents.id, ev.id));
      }
    } catch (e) {
      console.error("event failed", ev, e);
      await ctx.db.update(scheduledEvents).set({ status: "done", doneAt: ctx.now }).where(eq(scheduledEvents.id, ev.id));
      await log(ctx, ev.jobId, "info", `Something went wrong running a step (${ev.type})`, e instanceof Error ? e.message : String(e));
    }
  }
}

// ---------- Booking, cancellation ----------

/** First "1" wins: only one claim can flip the job from open to booked. */
export async function claim(ctx: Ctx, job: Job, offer: Offer, provider: Provider) {
  const won = await ctx.db.update(jobs).set({ status: "booked", bookedOfferId: offer.id })
    .where(and(eq(jobs.id, job.id), eq(jobs.status, "open"))).returning();
  if (!won.length) return false;
  await ctx.db.update(offers).set({ reply: "yes", repliedAt: ctx.now }).where(eq(offers.id, offer.id));
  await cancelEvents(ctx, job.id, ["send_tier", "ask_unavailable", "remind", "head_start", "head_start_end", "close"]);
  await textProvider(ctx, provider, T.booked(ctx.hh, job, offer.rateCents), job.id);

  const others = (await jobOffers(ctx, job.id)).filter((r) => r.offer.id !== offer.id && r.offer.reply !== "dropped");
  for (const r of others) {
    await textProvider(ctx, r.provider, r.offer.reply === "backup" ? T.filledBackup(ctx.hh, job) : T.filled(ctx.hh, job), job.id);
  }
  await log(ctx, job.id, "booked", `${provider.name} replied 1 and is booked${offer.rateCents != null ? ` at ${money(offer.rateCents)}/hr` : ""}`,
    `Confirmation sent · parents texted${others.length ? ` · "Job filled" text to ${others.map((r) => r.provider.name).join(", ")}` : ""}`);
  await alertParents(ctx, T.pBooked(ctx.hh, job, provider.name, offer.rateCents), job.id);

  // Day-of reminder: 9 am that day, or 7 pm the night before for jobs starting before 9.
  const start = local(job.startsAt, ctx.hh.timezone);
  const remindAt = (start.hour < 9 ? start.minus({ days: 1 }).set({ hour: 19, minute: 0 }) : start.set({ hour: 9, minute: 0 }))
    .startOf("minute").toJSDate();
  if (remindAt > ctx.now) await schedule(ctx, job.id, "day_reminder", remindAt);
  return true;
}

/** The booked sitter can't make it. Reopen on its own: backups first, then everyone who didn't say no. */
export async function dropBooking(ctx: Ctx, job: Job, offer: Offer, provider: Provider, byParent = false) {
  if (job.status !== "booked" || job.bookedOfferId !== offer.id) return false;
  await ctx.db.update(offers).set({ reply: "dropped", repliedAt: ctx.now }).where(eq(offers.id, offer.id));
  await ctx.db.update(jobs).set({ status: "open", bookedOfferId: null }).where(eq(jobs.id, job.id));
  job.status = "open";
  job.bookedOfferId = null;
  await cancelEvents(ctx, job.id, ["day_reminder"]);
  if (!byParent) await textProvider(ctx, provider, T.dropAck(ctx.hh, job), job.id);

  const backups = (await jobOffers(ctx, job.id)).filter((r) => r.offer.reply === "backup");
  const plan = backups.length
    ? `${backups.map((b) => b.provider.name).join(", ")} (backup${backups.length > 1 ? "s" : ""}) get first dibs for ${headStartMinutes(ctx, job)} min, then everyone who didn't say no.`
    : "everyone who didn't say no is being texted, then the remaining tiers.";
  await log(ctx, job.id, "canceled",
    byParent ? `You marked ${provider.name} as canceled. Job reopened automatically.` : `${provider.name} replied DROP. Job reopened automatically.`,
    `Parents texted · ${provider.name} won't be offered this job again`);
  await alertParents(ctx, T.pDropped(ctx.hh, job, provider.name, plan), job.id);
  await scheduleClose(ctx, job);
  const at = sitterSendTime(ctx, job, ctx.now);
  await schedule(ctx, job.id, backups.length ? "head_start" : "head_start_end", at);
  await runDue(ctx);
  return true;
}

// ---------- Parent actions from the web app ----------

export async function textEveryoneNow(ctx: Ctx, jobId: number) {
  const job = await getJob(ctx, jobId);
  if (job.status !== "open") return;
  await cancelEvents(ctx, jobId, ["send_tier", "head_start_end"]);
  await log(ctx, jobId, "you", "You chose: text everyone now");
  for (let t = job.tierSent + 1; t <= TIER_COUNT; t++) {
    await onSendTier(ctx, job, t);
    await cancelEvents(ctx, jobId, ["send_tier", "ask_unavailable"]);
  }
  // Re-text people already asked who haven't answered.
  const fresh = await getJob(ctx, jobId);
  await onHeadStartEnd(ctx, fresh);
  await runDue(ctx);
}

export async function askUnavailableNow(ctx: Ctx, jobId: number) {
  const job = await getJob(ctx, jobId);
  if (job.status !== "open") return;
  await cancelEvents(ctx, jobId, ["ask_unavailable"]);
  await log(ctx, jobId, "you", "You chose: ask usually-unavailable sitters now");
  await onAskUnavailable(ctx, job);
}

export async function setPaused(ctx: Ctx, jobId: number, paused: boolean) {
  await ctx.db.update(jobs).set({ paused }).where(eq(jobs.id, jobId));
  await log(ctx, jobId, "you", paused ? "You paused texting for this job" : "You resumed texting");
  if (!paused) await runDue(ctx);
}

export async function nudge(ctx: Ctx, jobId: number, offerId: number) {
  const job = await getJob(ctx, jobId);
  const [r] = (await jobOffers(ctx, jobId)).filter((x) => x.offer.id === offerId);
  if (!r || job.status !== "open") return;
  const showCode = (await liveOfferCount(ctx, r.provider.id)) > 1;
  await textProvider(ctx, r.provider, T.reminder(ctx.hh, job, showCode), jobId);
  await log(ctx, jobId, "reminder", `You nudged ${r.provider.name}`);
}

export async function cancelJob(ctx: Ctx, jobId: number) {
  const job = await getJob(ctx, jobId);
  if (!["open", "booked", "closed", "draft"].includes(job.status)) return;
  await ctx.db.update(jobs).set({ status: "canceled" }).where(eq(jobs.id, jobId));
  await cancelEvents(ctx, jobId);
  if (job.status === "draft") return;
  const rows = await jobOffers(ctx, jobId);
  const told: string[] = [];
  for (const r of rows) {
    if (r.offer.id === job.bookedOfferId) { await textProvider(ctx, r.provider, T.canceledToBooked(ctx.hh, job), jobId); told.push(r.provider.name); }
    else if (["none", "maybe", "backup"].includes(r.offer.reply)) { await textProvider(ctx, r.provider, T.canceledToOthers(ctx.hh, job), jobId); told.push(r.provider.name); }
  }
  await log(ctx, jobId, "you", "You canceled the job", told.length ? `Told ${told.join(", ")}` : null);
}

export async function parentMarksDropped(ctx: Ctx, jobId: number) {
  const job = await getJob(ctx, jobId);
  if (job.status !== "booked" || !job.bookedOfferId) return;
  const [r] = (await jobOffers(ctx, jobId)).filter((x) => x.offer.id === job.bookedOfferId);
  if (r) await dropBooking(ctx, job, r.offer, r.provider, true);
}

export async function reopenClosed(ctx: Ctx, jobId: number) {
  const job = await getJob(ctx, jobId);
  if (job.status !== "closed" || job.startsAt <= ctx.now) return false;
  await ctx.db.update(jobs).set({ status: "open", closeBeforeHours: 0 }).where(eq(jobs.id, jobId));
  job.status = "open";
  await log(ctx, jobId, "you", "You reopened the job until it starts");
  await scheduleNextStep(ctx, job, ctx.now, true);
  await runDue(ctx);
  return true;
}

export { DateTime };
