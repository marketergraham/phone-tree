// Handles every text that comes in, from sitters and from parents.
import { and, eq, gt, inArray } from "drizzle-orm";
import { schema } from "@/db";
import { Ctx, Job, Offer, Provider, alertParents, log, text, textProvider } from "./context";
import { T } from "./texts";
import { claim, dropBooking, reopenClosed } from "./rollout";

const { jobs, offers, providers, parents, messages } = schema;

const OPT_OUT = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPTOUT"]);
const OPT_IN = new Set(["START", "UNSTOP", "JOIN", "YES"]);

type Row = { offer: Offer; job: Job };

async function sitterRows(ctx: Ctx, providerId: number): Promise<Row[]> {
  return ctx.db.select({ offer: offers, job: jobs }).from(offers).innerJoin(jobs, eq(offers.jobId, jobs.id))
    .where(and(eq(offers.providerId, providerId), inArray(jobs.status, ["open", "booked", "closed"]), gt(jobs.startsAt, ctx.now)));
}

/** Record an incoming text once (by Twilio id) and process it. Returns false if already seen. */
export async function receive(ctx: Ctx, from: string, body: string, sid: string | null, receivedAt?: Date) {
  if (sid) {
    const exists = await ctx.db.select({ id: messages.id }).from(messages).where(eq(messages.twilioSid, sid));
    if (exists.length) return false;
  }
  const [m] = await ctx.db.insert(messages).values({
    direction: "in", phone: from, body, twilioSid: sid, status: "received", at: receivedAt ?? ctx.now,
  }).onConflictDoNothing().returning();
  if (!m) return false;
  await handle(ctx, from, body);
  await ctx.db.update(messages).set({ processedAt: ctx.now }).where(eq(messages.id, m.id));
  return true;
}

async function handle(ctx: Ctx, from: string, rawBody: string) {
  const body = rawBody.trim();
  const kw = body.toUpperCase().replace(/[^A-Z0-9 ]/g, "").trim();

  const [parent] = await ctx.db.select().from(parents).where(eq(parents.phone, from));
  if (parent) return handleParent(ctx, kw);

  const [p] = await ctx.db.select().from(providers).where(eq(providers.phone, from));
  if (!p) {
    if (OPT_IN.has(kw)) {
      await text(ctx, from, T.notAdded(ctx.hh));
      await alertParents(ctx, T.pUnknownJoin(from));
    } else {
      await alertParents(ctx, T.pForward("Unknown number", from, body));
    }
    return;
  }

  if (OPT_OUT.has(kw)) {
    // Carriers/Twilio stop all texts to this number after these words; record it and tell the parents.
    await ctx.db.update(providers).set({ optedOut: true }).where(eq(providers.id, p.id));
    const booked = (await sitterRows(ctx, p.id)).some((r) => r.job.status === "booked" && r.job.bookedOfferId === r.offer.id);
    await alertParents(ctx, T.pOptOut(p.name, p.phone, booked));
    return;
  }
  if (OPT_IN.has(kw)) {
    await ctx.db.update(providers).set({ joined: true, joinedAt: p.joinedAt ?? ctx.now, optedOut: false }).where(eq(providers.id, p.id));
    if (kw === "JOIN" || !p.joined) await text(ctx, p.phone, T.joined(ctx.hh));
    return;
  }
  if (!p.joined) {
    await text(ctx, p.phone, T.pleaseJoin());
    return;
  }
  if (kw === "HELP" || kw === "INFO") {
    await textProvider(ctx, p, T.help(ctx.hh));
    return;
  }

  const drop = /^DROP\s*([A-Z])?$/.exec(kw);
  if (drop) return handleDrop(ctx, p, drop[1]);

  // "1", "1B", "1 b" or "B1"
  const a = /^([1-4])\s*([A-Z])?$/.exec(kw);
  const b = /^([A-Z])\s*([1-4])$/.exec(kw);
  if (a) return handleDigit(ctx, p, a[1], a[2]);
  if (b) return handleDigit(ctx, p, b[2], b[1]);

  // Anything else: pass it to the parents.
  await alertParents(ctx, T.pForward(p.name, p.phone, body));
  await textProvider(ctx, p, T.passedAlong(ctx.hh));
}

async function handleParent(ctx: Ctx, kw: string) {
  const open = /^OPEN\s*([A-Z])$/.exec(kw);
  if (open) {
    const [j] = await ctx.db.select().from(jobs).where(and(eq(jobs.code, open[1]), eq(jobs.status, "closed"), gt(jobs.startsAt, ctx.now)));
    if (j && (await reopenClosed(ctx, j.id))) await alertParents(ctx, T.pReopened(ctx.hh, j), j.id);
    else await alertParents(ctx, `Phone Tree: No closed job ${open[1]} found.`);
    return;
  }
  await alertParents(ctx, T.pHelp());
}

async function handleDrop(ctx: Ctx, p: Provider, code?: string) {
  let rows = (await sitterRows(ctx, p.id)).filter((r) => r.job.status === "booked" && r.job.bookedOfferId === r.offer.id);
  if (code) rows = rows.filter((r) => r.job.code === code);
  if (!rows.length) return textProvider(ctx, p, T.noBooking());
  if (rows.length > 1) {
    return textProvider(ctx, p, `You're booked for ${rows.length} jobs: ${rows.map((r) => r.job.code).join(", ")}. Reply DROP plus the letter, like DROP ${rows[0].job.code}.`);
  }
  await dropBooking(ctx, rows[0].job, rows[0].offer, p);
}

async function handleDigit(ctx: Ctx, p: Provider, digit: string, code?: string) {
  let rows = (await sitterRows(ctx, p.id)).filter((r) => r.offer.reply !== "dropped");
  if (code) rows = rows.filter((r) => r.job.code === code);
  if (!code && rows.length > 1) {
    // Prefer jobs that are still open; for "4", jobs that are booked.
    const pref = rows.filter((r) => (digit === "4" ? r.job.status === "booked" : r.job.status === "open"));
    if (pref.length === 1) rows = pref;
    else if (pref.length > 1) return textProvider(ctx, p, T.whichJob(ctx.hh, pref.map((r) => r.job), digit));
    else return textProvider(ctx, p, T.whichJob(ctx.hh, rows.map((r) => r.job), digit));
  }
  if (!rows.length) return textProvider(ctx, p, T.noJob());
  const { job, offer } = rows[0];
  const iAmBooked = job.status === "booked" && job.bookedOfferId === offer.id;
  const setReply = (reply: Offer["reply"]) =>
    ctx.db.update(offers).set({ reply, repliedAt: ctx.now }).where(eq(offers.id, offer.id));

  if (digit === "1") {
    if (iAmBooked) return textProvider(ctx, p, T.alreadyBooked(ctx.hh, job), job.id);
    if (job.status === "open") {
      if (await claim(ctx, job, offer, p)) return;
    }
    const [fresh] = await ctx.db.select().from(jobs).where(eq(jobs.id, job.id));
    if (fresh.status === "booked") {
      await setReply("backup");
      await textProvider(ctx, p, T.tooLate(ctx.hh, job), job.id);
      await log(ctx, job.id, "reply", `${p.name} replied 1 after it was taken, so she's now a backup`);
      return;
    }
    await textProvider(ctx, p, T.noLonger(), job.id);
    await alertParents(ctx, `Phone Tree: ${p.name} replied 1 to job ${job.code}, which isn't being offered anymore. Text her if you still need someone.`, job.id);
    await log(ctx, job.id, "reply", `${p.name} replied 1 after the job stopped being offered`, "Forwarded to parents");
    return;
  }
  if (iAmBooked) return textProvider(ctx, p, T.alreadyBooked(ctx.hh, job), job.id);
  if (digit === "2") {
    await setReply("no");
    await textProvider(ctx, p, T.ackNo(), job.id);
    await log(ctx, job.id, "reply", `${p.name} replied 2, can't make it`, "No more texts to her about this job");
    return;
  }
  if (digit === "3") {
    await setReply("maybe");
    await textProvider(ctx, p, T.ackMaybe(), job.id);
    await log(ctx, job.id, "reply", `${p.name} replied 3, maybe`, "Replying 1 later still claims it");
    return;
  }
  // 4 = backup
  if (job.status === "open") return textProvider(ctx, p, T.stillOpen(), job.id);
  if (job.status === "booked") {
    await setReply("backup");
    await textProvider(ctx, p, T.backupAck(ctx.hh, job), job.id);
    await log(ctx, job.id, "reply", `${p.name} replied 4 and joined the backup list`);
    return;
  }
  await textProvider(ctx, p, T.noLonger(), job.id);
}
