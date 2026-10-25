// Read-only views of jobs for the web pages.
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { schema } from "@/db";
import { Ctx, Job, texting } from "@/lib/engine/context";
import { candidates, headStartMinutes, jobOffers, TIER_COUNT } from "@/lib/engine/rollout";
import { fmtRange, fmtStamp, fmtTime, insideTextingHours, local, money, nextTextingTime } from "@/lib/time";

const { jobs, scheduledEvents, timeline } = schema;
const HOUR = 3600_000;

export type Tone = "open" | "booked" | "red" | "plain" | "violet";

export function jobWhen(ctx: Ctx, j: Job) {
  const tz = ctx.hh.timezone;
  return { day: local(j.startsAt, tz).toFormat("ccc, LLL d"), time: fmtRange(j.startsAt, j.endsAt, tz) };
}

async function pendingEvents(ctx: Ctx, jobId: number) {
  return ctx.db.select().from(scheduledEvents)
    .where(and(eq(scheduledEvents.jobId, jobId), inArray(scheduledEvents.status, ["pending", "running"])))
    .orderBy(asc(scheduledEvents.runAt), asc(scheduledEvents.id));
}

const SITTER_FACING = new Set(["send_tier", "ask_unavailable", "remind", "head_start", "head_start_end"]);
/** When a pending step will actually happen, after texting hours are applied. */
function effectiveTime(ctx: Ctx, job: Job, type: string, runAt: Date) {
  const at = runAt < ctx.now ? ctx.now : runAt;
  if (!SITTER_FACING.has(type) || job.allowAnyHour) return at;
  if (job.startsAt.getTime() - at.getTime() < 12 * HOUR) return at;
  return insideTextingHours(at, texting(ctx)) ? at : nextTextingTime(at, texting(ctx));
}

type Future = { at: Date; text: string; detail?: string; type: string };

async function describeFuture(ctx: Ctx, job: Job): Promise<Future[]> {
  const evs = await pendingEvents(ctx, job.id);
  const rows = await jobOffers(ctx, job.id);
  const out: Future[] = [];
  for (const ev of evs) {
    const at = effectiveTime(ctx, job, ev.type, ev.runAt);
    const held = at.getTime() > ev.runAt.getTime() + 60_000 ? `Due ${fmtTime(ev.runAt, ctx.hh.timezone)}, held for texting hours` : undefined;
    switch (ev.type) {
      case "send_tier": {
        const tier = Number(ev.payload.tier);
        const { ok } = await candidates(ctx, job, [tier]);
        const send = ok.filter((c) => c.usual || job.unavailableMode === "start");
        out.push({ at, type: ev.type, text: send.length ? `Tier ${tier} texted: ${send.map((c) => c.provider.name).join(", ")}` : `Tier ${tier} (no one to text)`, detail: held });
        break;
      }
      case "ask_unavailable": {
        const { ok } = await candidates(ctx, job, [1, 2, 3]);
        const list = ok.filter((c) => !c.usual).map((c) => c.provider.name);
        out.push({ at, type: ev.type, text: `${list.join(" and ") || "Usually-unavailable sitters"} asked "just in case"`, detail: held });
        break;
      }
      case "remind": {
        const names = rows.filter((r) => ["none", "maybe", "backup"].includes(r.offer.reply)).map((r) => r.provider.name);
        out.push({ at, type: ev.type, text: names.length ? `Reminder to ${names.join(", ")}` : "Reminder to anyone who hasn't said no", detail: held });
        break;
      }
      case "head_start": {
        const names = rows.filter((r) => r.offer.reply === "backup").map((r) => r.provider.name);
        out.push({ at, type: ev.type, text: `Backups texted first: ${names.join(", ")}`, detail: held });
        break;
      }
      case "head_start_end": {
        const names = rows.filter((r) => ["none", "maybe"].includes(r.offer.reply)).map((r) => r.provider.name);
        out.push({
          at, type: ev.type,
          text: names.length ? `Head start ends. ${names.join(", ")} texted again.` : "Head start ends. Recruiting picks up where it left off.",
          detail: "Backups can still claim it. First 1 wins.",
        });
        break;
      }
      case "close":
        out.push({ at, type: ev.type, text: "Stops offering if nobody's claimed it; parents get a text" });
        break;
      case "day_reminder": {
        const booked = rows.find((r) => r.offer.id === job.bookedOfferId);
        out.push({ at, type: ev.type, text: `Day-of reminder to ${booked?.provider.name ?? "the sitter"}` });
        break;
      }
    }
  }
  // Rollout steps are scheduled one at a time. Project the rest so the plan reads end to end.
  if (job.status === "open") {
    const rolloutTypes = ["send_tier", "head_start", "head_start_end", "ask_unavailable"];
    const anchor = [...evs].reverse().find((e) => rolloutTypes.includes(e.type));
    const close = evs.find((e) => e.type === "close")?.runAt;
    if (anchor && anchor.type !== "ask_unavailable") {
      let t = effectiveTime(ctx, job, anchor.type, anchor.runAt);
      let tier = job.tierSent;
      const add = async (at: Date, text: string) => {
        if (close && at >= close) return false;
        out.push({ at, type: "projected", text, detail: "Planned, if no one has claimed it by then" });
        return true;
      };
      if (anchor.type === "head_start") {
        t = new Date(t.getTime() + headStartMinutes(ctx, job) * 60000);
        const names = rows.filter((r) => ["none", "maybe"].includes(r.offer.reply)).map((r) => r.provider.name);
        await add(t, names.length ? `Head start ends. ${names.join(", ")} texted again.` : "Head start ends. Recruiting picks up where it left off.");
      }
      if (anchor.type === "send_tier") tier = Number(anchor.payload.tier);
      while (tier < TIER_COUNT) {
        tier += 1;
        t = effectiveTime(ctx, job, "send_tier", new Date(t.getTime() + (job.tierWaits[tier - 2] ?? 24) * HOUR));
        const { ok } = await candidates(ctx, job, [tier]);
        const send = ok.filter((c) => c.usual || job.unavailableMode === "start");
        if (!(await add(t, send.length ? `Tier ${tier} texted: ${send.map((c) => c.provider.name).join(", ")}` : `Tier ${tier} (no one to text)`))) break;
      }
      if (tier >= TIER_COUNT && job.unavailableMode === "end" && !job.unavailableAsked) {
        const { ok } = await candidates(ctx, job, [1, 2, 3]);
        const list = ok.filter((c) => !c.usual).map((c) => c.provider.name);
        if (list.length) {
          t = effectiveTime(ctx, job, "ask_unavailable", new Date(t.getTime() + job.unavailableWaitHours * HOUR));
          await add(t, `${list.join(" and ")} asked "just in case"`);
        }
      }
    }
  }
  return out.sort((a, b) => +a.at - +b.at);
}

export async function jobStatus(ctx: Ctx, job: Job): Promise<{ label: string; tone: Tone }> {
  if (job.status === "draft") return { label: "Draft", tone: "plain" };
  if (job.status === "canceled") return { label: "Canceled", tone: "plain" };
  if (job.endsAt < ctx.now) return { label: job.status === "booked" ? "Done" : "Past", tone: "plain" };
  if (job.status === "closed") return { label: "Closed · unfilled", tone: "red" };
  if (job.status === "booked") return { label: "Booked", tone: "booked" };
  if (job.paused) return { label: "Paused", tone: "plain" };
  const evs = await pendingEvents(ctx, job.id);
  if (evs.some((e) => e.type === "head_start" || e.type === "head_start_end")) return { label: "Reopened", tone: "red" };
  if (job.tierSent === 0) return { label: "Waiting to send", tone: "open" };
  if (job.tierSent >= TIER_COUNT) return { label: job.unavailableAsked ? "Everyone asked" : "All tiers asked", tone: "open" };
  return { label: `Tier ${job.tierSent} live`, tone: "open" };
}

export async function jobListItem(ctx: Ctx, job: Job) {
  const status = await jobStatus(ctx, job);
  const rows = await jobOffers(ctx, job.id);
  const booked = rows.find((r) => r.offer.id === job.bookedOfferId);
  const count = (reply: string) => rows.filter((r) => r.offer.reply === reply).length;
  let summary = "";
  if (job.status === "booked" && booked) {
    const b = count("backup");
    summary = `${booked.provider.name}${booked.offer.rateCents != null ? ` · ${money(booked.offer.rateCents)}/hr` : ""}${b ? ` · ${b} backup${b > 1 ? "s" : ""}` : ""}`;
  } else if (job.status === "open") {
    const parts = [];
    if (count("maybe")) parts.push(`${count("maybe")} maybe`);
    if (count("none")) parts.push(`${count("none")} no reply`);
    if (count("backup")) parts.push(`${count("backup")} backup`);
    summary = parts.join(" · ") || (rows.length ? "No replies yet" : "");
  } else if (job.status === "draft") summary = "Not sent yet";
  const future = job.status === "open" || job.status === "booked" ? await describeFuture(ctx, job) : [];
  const next = future[0];
  return {
    job, status, summary, when: jobWhen(ctx, job),
    next: next ? `Next: ${next.text} · ${fmtStamp(next.at, ctx.hh.timezone)}` : null,
  };
}

export async function listJobs(ctx: Ctx, past: boolean) {
  const all = await ctx.db.select().from(jobs).orderBy(past ? desc(jobs.startsAt) : asc(jobs.startsAt));
  const items = [];
  for (const j of all) {
    const isPast = j.endsAt < ctx.now || j.status === "canceled";
    if (isPast !== past) continue;
    items.push(await jobListItem(ctx, j));
  }
  return items;
}

export async function jobDetail(ctx: Ctx, job: Job) {
  const tz = ctx.hh.timezone;
  const rows = await jobOffers(ctx, job.id);
  const past = await ctx.db.select().from(timeline).where(eq(timeline.jobId, job.id)).orderBy(asc(timeline.at), asc(timeline.id));
  const future = job.status === "open" || job.status === "booked" ? await describeFuture(ctx, job) : [];
  const status = await jobStatus(ctx, job);

  // Sitters not yet asked, grouped for the side panel.
  const notAsked: { name: string; why: string }[] = [];
  if (job.status === "open" || job.status === "draft") {
    const { ok, skipped } = await candidates(ctx, job, [1, 2, 3]);
    for (const c of ok) {
      if (c.usual || job.unavailableMode === "start") {
        notAsked.push({ name: c.provider.name, why: c.provider.tier > job.tierSent ? `Tier ${c.provider.tier} · not yet` : `Tier ${c.provider.tier}` });
      } else {
        notAsked.push({ name: c.provider.name, why: job.unavailableMode === "end" ? "Not usually free then · asked at the end" : "Not usually free then · won't be asked" });
      }
    }
    for (const s of skipped) notAsked.push({ name: s.provider.name, why: `Skipped: ${s.reason}` });
  }

  const label: Record<string, { text: string; tone: Tone }> = {
    none: { text: "No reply", tone: "plain" }, maybe: { text: "Maybe", tone: "open" }, no: { text: "Can't", tone: "plain" },
    backup: { text: "Backup", tone: "booked" }, yes: { text: "Booked", tone: "booked" }, dropped: { text: "Canceled", tone: "red" },
  };
  const sitters = rows.map((r) => {
    const l = r.offer.id === job.bookedOfferId ? label.yes : r.offer.reply === "yes" ? { text: "Was booked", tone: "plain" as Tone } : label[r.offer.reply];
    return {
      offerId: r.offer.id, name: r.provider.name, tier: r.offer.tier, rate: money(r.offer.rateCents),
      reply: l, outsideUsual: r.offer.outsideUsual, sentAt: fmtStamp(r.offer.sentAt, tz), canNudge: job.status === "open" && ["none", "maybe"].includes(r.offer.reply),
    };
  });
  const stats = {
    texted: rows.length,
    maybe: rows.filter((r) => r.offer.reply === "maybe").length,
    no: rows.filter((r) => r.offer.reply === "no").length,
    waiting: rows.filter((r) => r.offer.reply === "none").length,
    backups: rows.filter((r) => r.offer.reply === "backup").length,
  };
  return {
    status, stats, sitters, notAsked,
    past: past.map((p) => ({ ...p, stamp: fmtStamp(p.at, tz) })),
    future: future.map((f) => ({ ...f, stamp: fmtStamp(f.at, tz) })),
    nowStamp: fmtStamp(ctx.now, tz),
    canAskUnavailable: job.status === "open" && job.unavailableMode !== "start" && !job.unavailableAsked && notAsked.some((n) => n.why.startsWith("Not usually")),
  };
}
