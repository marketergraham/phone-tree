import { eq, and, inArray, sql } from "drizzle-orm";
import { getDb, DB, schema } from "@/db";
import { deliver, smsDriver } from "@/lib/sms";
import type { EventType, TimelineKind } from "@/db/schema";

const { household, messages, scheduledEvents, timeline, parents, providers } = schema;

export type Household = typeof household.$inferSelect;
export type Job = typeof schema.jobs.$inferSelect;
export type Provider = typeof providers.$inferSelect;
export type Offer = typeof schema.offers.$inferSelect;
export type ScheduledEvent = typeof scheduledEvents.$inferSelect;

export type Ctx = { db: DB; now: Date; hh: Household };

export async function getHousehold(db: DB): Promise<Household> {
  const rows = await db.select().from(household).limit(1);
  if (rows[0]) return rows[0];
  const [created] = await db.insert(household).values({}).returning();
  return created;
}

/** Current time. The test simulator can move the clock forward; real Twilio mode never does. */
export async function loadCtx(db: DB = getDb(), now?: Date): Promise<Ctx> {
  const hh = await getHousehold(db);
  const offset = smsDriver() === "fake" ? hh.testClockOffsetMs : 0;
  return { db, hh, now: now ?? new Date(Date.now() + offset) };
}

export function texting(ctx: Ctx) {
  return { tz: ctx.hh.timezone, startMin: ctx.hh.textingStartMin, endMin: ctx.hh.textingEndMin };
}

export function jobUrl(jobId: number) {
  return `${process.env.PUBLIC_URL ?? ""}/jobs/${jobId}`;
}

/** Send a text and record it. */
export async function text(ctx: Ctx, to: string, body: string, jobId?: number | null) {
  const r = await deliver(to, body);
  await ctx.db.insert(messages).values({
    direction: "out", phone: to, body, twilioSid: r.sid, status: r.status, error: r.error ?? null,
    jobId: jobId ?? null, at: ctx.now,
  });
  return r;
}

export async function textProvider(ctx: Ctx, p: Provider, body: string, jobId?: number | null) {
  if (p.optedOut) return;
  let msg = body;
  if (!p.everTexted) {
    msg += "\nReply STOP to opt out.";
    await ctx.db.update(providers).set({ everTexted: true }).where(eq(providers.id, p.id));
    p.everTexted = true;
  }
  await text(ctx, p.phone, msg, jobId);
}

export async function alertParents(ctx: Ctx, body: string, jobId?: number) {
  const list = await ctx.db.select().from(parents).where(eq(parents.alerts, true));
  const msg = jobId ? `${body}\n${jobUrl(jobId)}` : body;
  for (const p of list) await text(ctx, p.phone, msg, jobId ?? null);
}

export async function log(ctx: Ctx, jobId: number, kind: TimelineKind, txt: string, detail?: string | null) {
  await ctx.db.insert(timeline).values({ jobId, at: ctx.now, kind, text: txt, detail: detail ?? null });
}

export async function schedule(ctx: Ctx, jobId: number, type: EventType, runAt: Date, payload: Record<string, unknown> = {}) {
  await ctx.db.insert(scheduledEvents).values({ jobId, type, runAt, payload });
}

export async function cancelEvents(ctx: Ctx, jobId: number, types?: EventType[]) {
  const conds = [eq(scheduledEvents.jobId, jobId), eq(scheduledEvents.status, "pending")];
  if (types) conds.push(inArray(scheduledEvents.type, types));
  await ctx.db.update(scheduledEvents).set({ status: "canceled", doneAt: ctx.now }).where(and(...conds));
}

export const sqlNow = sql`now()`;
