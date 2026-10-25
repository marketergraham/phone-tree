import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { sql, eq, asc, and } from "drizzle-orm";
import { DateTime } from "luxon";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://pt:pt@localhost:5432/phonetree_test";
process.env.SMS_DRIVER = "fake";
process.env.PUBLIC_URL = "https://pt.example";

import { getDb, closeDb, schema } from "../src/db";
import { loadCtx } from "../src/lib/engine/context";
import { sendJob, runDue, getJob, jobOffers } from "../src/lib/engine/rollout";
import { receive } from "../src/lib/engine/inbound";

const db = getDb();
const TZ = "America/Los_Angeles";
const at = (s: string) => DateTime.fromISO(s, { zone: TZ }).toJSDate();
const EVE = ["6:evening", "6:late"]; // Saturday evening + late evening

const P = {
  maya: "+19255550142", jess: "+19255550187", priya: "+19255550119",
  elena: "+19255550163", hannah: "+19255550108", rosa: "+19255550174", tara: "+19255550131",
  graham: "+15105550100", susanna: "+15105550101",
};
let sid = 0;
const reply = async (now: string, phone: string, body: string) => receive(await loadCtx(db, at(now)), phone, body, `SM${++sid}`);
const tick = async (now: string) => runDue(await loadCtx(db, at(now)));
const outTo = async (phone: string) =>
  (await db.select().from(schema.messages).where(and(eq(schema.messages.phone, phone), eq(schema.messages.direction, "out"))).orderBy(asc(schema.messages.id))).map((m) => m.body);
const last = async (phone: string) => (await outTo(phone)).at(-1) ?? "";

async function reset() {
  await db.execute(sql`truncate household, parents, providers, away_dates, jobs, offers, scheduled_events, timeline, messages, login_codes, sessions restart identity cascade`);
  await db.insert(schema.household).values({});
  await db.insert(schema.parents).values([{ name: "Graham", phone: P.graham }, { name: "Susanna", phone: P.susanna }]);
  const base = { joined: true, availability: EVE };
  await db.insert(schema.providers).values([
    { ...base, name: "Maya R.", phone: P.maya, rateCents: 2600, tier: 1 },
    { ...base, name: "Jess T.", phone: P.jess, rateCents: 2400, tier: 1 },
    { ...base, name: "Priya K.", phone: P.priya, rateCents: 2700, tier: 1, availability: ["6:afternoon"] },
    { ...base, name: "Elena V.", phone: P.elena, rateCents: 2800, tier: 2 },
    { ...base, name: "Hannah B.", phone: P.hannah, rateCents: 2200, tier: 2, availability: [] },
    { ...base, name: "Rosa M.", phone: P.rosa, rateCents: 2500, tier: 3 },
    { ...base, name: "Tara L.", phone: P.tara, rateCents: 2300, tier: 3 },
  ]);
}

async function newJob(fields: Partial<typeof schema.jobs.$inferInsert> = {}) {
  const [j] = await db.insert(schema.jobs).values({
    startsAt: at("2026-10-24T18:00"), endsAt: at("2026-10-24T23:00"), kids: "2 kids (4 and 7)", ...fields,
  }).returning();
  return j.id;
}

before(async () => { await reset(); });
beforeEach(async () => { await reset(); });
after(async () => { await closeDb(); });

test("Tier 1 waits for texting hours and skips sitters who aren't usually free", async () => {
  const id = await newJob();
  await sendJob(await loadCtx(db, at("2026-10-16T23:00")), id);
  assert.equal((await outTo(P.maya)).length, 0, "nothing sent at 11 pm");
  await tick("2026-10-17T08:00");
  assert.match(await last(P.maya), /Graham & Susanna at Blessing Way have a new job: Sat Oct 24, 6:00–11:00 pm, 2 kids \(4 and 7\)\. Pays \$26\/hr/);
  assert.match(await last(P.maya), /Reply STOP to opt out/, "first text includes opt-out");
  assert.match(await last(P.jess), /Pays \$24\/hr/, "each sitter's own rate");
  assert.equal((await outTo(P.priya)).length, 0, "Priya held for the end");
  assert.equal((await outTo(P.elena)).length, 0, "Tier 2 not yet");
  const job = await getJob(await loadCtx(db), id);
  assert.equal(job.tierSent, 1);
});

test("Full life of a job: maybe, reminders, tiers, booking, backup, cancellation, reopen", async () => {
  const id = await newJob();
  await sendJob(await loadCtx(db, at("2026-10-16T23:00")), id);
  await tick("2026-10-17T08:00");
  await reply("2026-10-17T11:42", P.maya, "3");
  assert.match(await last(P.maya), /down as a maybe/);
  await reply("2026-10-17T11:50", P.jess, " 2 ");
  await tick("2026-10-17T20:00"); // reminder 12h after Tier 1
  assert.match(await last(P.maya), /Still open/);
  assert.doesNotMatch(await last(P.jess), /Still open/, "no reminder after saying no");
  await tick("2026-10-18T08:00"); // Tier 2, 24h after Tier 1
  assert.match(await last(P.elena), /Pays \$28\/hr/);
  assert.equal((await outTo(P.hannah)).length, 0);

  await reply("2026-10-18T09:14", P.elena, "1");
  assert.match(await last(P.elena), /You're booked!/);
  assert.match(await last(P.graham), /Elena V\. booked Sat 10\/24/);
  assert.match(await last(P.susanna), /Elena V\. booked/);
  assert.match(await last(P.maya), /has been filled.*Reply 4/);
  assert.match(await last(P.jess), /has been filled/);

  // Tier 3 never goes out now.
  await tick("2026-10-19T09:00");
  assert.equal((await outTo(P.rosa)).length, 0);

  await reply("2026-10-18T10:02", P.maya, "4");
  assert.match(await last(P.maya), /backup list/);

  // Elena drops Thursday 2:10 pm.
  await reply("2026-10-22T14:10", P.elena, "drop");
  assert.match(await last(P.elena), /you're off/);
  assert.match(await last(P.graham), /Elena V\. canceled.*Maya R\. \(backup\) get first dibs for 60 min/s);
  assert.match(await last(P.maya), /first dibs until 3:10 pm/);
  const mayaCount = (await outTo(P.maya)).length;

  await tick("2026-10-22T15:10"); // head start ends
  assert.equal((await outTo(P.maya)).length, mayaCount, "backup not re-texted");
  assert.equal((await outTo(P.jess)).filter((m) => /open again/.test(m)).length, 0, "Jess said no, so not re-texted");

  await tick("2026-10-23T15:10"); // Tier 3, 24h after the reopen
  assert.match(await last(P.rosa), /new job/);
  assert.match(await last(P.tara), /new job/);

  // Maya claims it while others can too; Rosa's later 1 makes her a backup.
  await reply("2026-10-23T16:00", P.maya, "1");
  assert.match(await last(P.maya), /You're booked!/);
  await reply("2026-10-23T16:01", P.rosa, "1");
  assert.match(await last(P.rosa), /So close/);

  // Day-of reminder at 9 am.
  await tick("2026-10-24T09:00");
  assert.match(await last(P.maya), /Reminder: you're with Graham & Susanna at Blessing Way today/);

  const tl = await db.select().from(schema.timeline).where(eq(schema.timeline.jobId, id)).orderBy(asc(schema.timeline.id));
  assert.ok(tl.some((t) => /Elena V\. replied DROP/.test(t.text)));
  assert.ok(tl.some((t) => t.kind === "booked" && /Maya R\./.test(t.text)));
});

test("Usually-unavailable sitters are asked at the end", async () => {
  const id = await newJob({ tierWaits: [1, 1], unavailableWaitHours: 2 });
  await sendJob(await loadCtx(db, at("2026-10-17T09:00")), id);
  await tick("2026-10-17T10:00");
  await tick("2026-10-17T11:00");
  assert.equal((await outTo(P.priya)).length, 0);
  await tick("2026-10-17T13:00");
  assert.match(await last(P.priya), /We know Saturdays (evening|late evening).* aren't usually your time/);
  assert.match(await last(P.hannah), /aren't usually your time/);
});

test("Unclaimed job closes, parents can reopen with OPEN", async () => {
  const id = await newJob();
  await sendJob(await loadCtx(db, at("2026-10-23T09:00")), id);
  await reply("2026-10-23T10:00", P.maya, "3");
  await tick("2026-10-24T12:00");
  const job = await getJob(await loadCtx(db), id);
  assert.equal(job.status, "closed");
  assert.match(await last(P.graham), /Nobody's claimed.*OPEN A/s);
  assert.match(await last(P.maya), /no longer needed/);
  await reply("2026-10-24T12:05", P.graham, "open a");
  assert.equal((await getJob(await loadCtx(db), id)).status, "open");
});

test("Job letters when a sitter has two open offers", async () => {
  const a = await newJob();
  const b = await newJob({ startsAt: at("2026-10-31T18:00"), endsAt: at("2026-10-31T22:00") });
  await sendJob(await loadCtx(db, at("2026-10-17T09:00")), a);
  await sendJob(await loadCtx(db, at("2026-10-17T09:05")), b);
  assert.match(await last(P.maya), /This is job B: reply 1B/);
  await reply("2026-10-17T09:10", P.maya, "1");
  assert.match(await last(P.maya), /You have 2 jobs open/);
  await reply("2026-10-17T09:11", P.maya, "b1");
  assert.equal((await getJob(await loadCtx(db), b)).status, "booked");
  assert.equal((await getJob(await loadCtx(db), a)).status, "open");
});

test("CANCEL is an opt-out word: parents are warned, nothing more is sent", async () => {
  const id = await newJob();
  await sendJob(await loadCtx(db, at("2026-10-17T09:00")), id);
  await reply("2026-10-17T09:10", P.maya, "1");
  await reply("2026-10-17T09:20", P.maya, "CANCEL");
  assert.match(await last(P.graham), /unsubscribed.*still booked/s);
  const offers = await jobOffers(await loadCtx(db), id);
  assert.ok(offers.find((o) => o.provider.phone === P.maya)?.provider.optedOut);
});

test("Duplicate Twilio deliveries are processed once", async () => {
  const id = await newJob();
  await sendJob(await loadCtx(db, at("2026-10-17T09:00")), id);
  const ctx = await loadCtx(db, at("2026-10-17T09:10"));
  assert.equal(await receive(ctx, P.maya, "3", "SMdup"), true);
  assert.equal(await receive(ctx, P.maya, "3", "SMdup"), false);
});
