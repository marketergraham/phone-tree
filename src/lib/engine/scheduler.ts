// Keeps Phone Tree moving: runs due steps every 30 seconds and catches any texts the webhook missed.
import { and, isNull, eq, lt, asc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { smsDriver, twilioClient, twilioNumber } from "@/lib/sms";
import { loadCtx } from "./context";
import { runDue } from "./rollout";
import { receive } from "./inbound";

let chain: Promise<unknown> = Promise.resolve();
/** Run work one at a time, so replies are handled in the order they arrive. */
export function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => undefined);
  return next;
}

let lastReconcile = 0;

export async function tick() {
  return serial(async () => {
    const db = getDb();
    await runDue(await loadCtx(db));
    if (smsDriver() === "twilio" && Date.now() - lastReconcile > 3 * 60_000) {
      lastReconcile = Date.now();
      await reconcile().catch((e) => console.error("reconcile failed", e));
    }
    await retryUnprocessed().catch((e) => console.error("retry failed", e));
  });
}

/** Ask Twilio for recent incoming texts and process any we never saw (e.g. during a deploy). */
async function reconcile() {
  const db = getDb();
  const list = await twilioClient().messages.list({
    to: twilioNumber(), dateSentAfter: new Date(Date.now() - 6 * 3600_000), limit: 200,
  });
  const inbound = list.filter((m) => m.direction === "inbound").sort((a, b) => +a.dateSent - +b.dateSent);
  for (const m of inbound) {
    const ctx = await loadCtx(db);
    const added = await receive(ctx, m.from, m.body ?? "", m.sid, m.dateSent ?? undefined);
    if (added) console.log(`Recovered missed text ${m.sid} from ${m.from}`);
  }
}

/** Texts stored but not processed (the server stopped mid-way). */
async function retryUnprocessed() {
  const db = getDb();
  const stale = await db.select().from(schema.messages)
    .where(and(eq(schema.messages.direction, "in"), isNull(schema.messages.processedAt), lt(schema.messages.at, new Date(Date.now() - 2 * 60_000))))
    .orderBy(asc(schema.messages.at)).limit(20);
  for (const m of stale) {
    // Remove and re-receive so it goes through the normal path once.
    await db.delete(schema.messages).where(eq(schema.messages.id, m.id));
    await receive(await loadCtx(db), m.phone, m.body, m.twilioSid, m.at);
  }
}

let started = false;
export function startScheduler() {
  if (started || process.env.SCHEDULER === "off") return;
  started = true;
  const run = () => tick().catch((e) => console.error("tick failed", e));
  setTimeout(run, 5_000);
  setInterval(run, 30_000);
  console.log("Phone Tree scheduler started");
}
