import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { smsDriver } from "@/lib/sms";
import { getHousehold, loadCtx } from "@/lib/engine/context";
import { receive } from "@/lib/engine/inbound";
import { runDue } from "@/lib/engine/rollout";
import { serial } from "@/lib/engine/scheduler";
import { ensureParents } from "@/lib/auth";
import { fmtStamp, prettyPhone } from "@/lib/time";

export const dynamic = "force-dynamic";

async function sendAs(phone: string, form: FormData) {
  "use server";
  if (smsDriver() !== "fake") return;
  const body = String(form.get("body") ?? "").trim();
  if (body) await serial(async () => receive(await loadCtx(), phone, body, `SIM${Date.now()}${Math.random().toString(36).slice(2, 6)}`));
  revalidatePath("/dev");
  redirect(`/dev?phone=${encodeURIComponent(phone)}`);
}

async function shiftClock(hours: number, phone: string) {
  "use server";
  if (smsDriver() !== "fake") return;
  const db = getDb();
  const hh = await getHousehold(db);
  const offset = hours === 0 ? 0 : hh.testClockOffsetMs + hours * 3600_000;
  await db.update(schema.household).set({ testClockOffsetMs: offset }).where(eq(schema.household.id, hh.id));
  await serial(async () => runDue(await loadCtx()));
  revalidatePath("/dev");
  redirect(`/dev${phone ? `?phone=${encodeURIComponent(phone)}` : ""}`);
}

export default async function Simulator({ searchParams }: { searchParams: Promise<{ phone?: string }> }) {
  if (smsDriver() !== "fake") notFound();
  await ensureParents();
  const { phone } = await searchParams;
  const db = getDb();
  const ctx = await loadCtx(db);
  const tz = ctx.hh.timezone;
  const people = [
    ...(await db.select().from(schema.parents).orderBy(asc(schema.parents.id))).map((p) => ({ name: `${p.name} (parent)`, phone: p.phone })),
    ...(await db.select().from(schema.providers).orderBy(asc(schema.providers.tier), asc(schema.providers.name))).map((p) => ({ name: p.name, phone: p.phone })),
  ];
  const selected = phone ?? people[0]?.phone;
  const convo = selected
    ? await db.select().from(schema.messages).where(eq(schema.messages.phone, selected)).orderBy(desc(schema.messages.id)).limit(80)
    : [];
  const upcoming = await db.select({ ev: schema.scheduledEvents, code: schema.jobs.code }).from(schema.scheduledEvents)
    .innerJoin(schema.jobs, eq(schema.scheduledEvents.jobId, schema.jobs.id))
    .where(inArray(schema.scheduledEvents.status, ["pending"])).orderBy(asc(schema.scheduledEvents.runAt)).limit(8);
  const sel = selected ?? "";

  return (
    <main className="page stack">
      <div className="row between">
        <div>
          <Link href="/jobs" className="back">← Back to Phone Tree</Link>
          <h1>Text simulator</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>Test mode. Every text Phone Tree &quot;sends&quot; shows up here, and you can reply as anyone.</p>
        </div>
      </div>

      <section className="card stack" aria-labelledby="clock-h">
        <div className="row between">
          <h2 id="clock-h">Clock: {fmtStamp(ctx.now, tz)}</h2>
          <span className="small muted">Move time forward to see tiers, reminders and head starts happen.</span>
        </div>
        <div className="row">
          {[1, 6, 12, 24].map((h) => (
            <form key={h} action={shiftClock.bind(null, h, sel)}><button className="btn" type="submit">+{h} h</button></form>
          ))}
          <form action={shiftClock.bind(null, 0, sel)}><button className="btn" type="submit">Back to real time</button></form>
        </div>
        {upcoming.length > 0 && (
          <p className="small muted" style={{ margin: 0 }}>
            Coming up: {upcoming.map((u) => `${u.ev.type.replace(/_/g, " ")} (job ${u.code}) ${fmtStamp(u.ev.runAt, tz)}`).join(" · ")}
          </p>
        )}
      </section>

      <div className="sms-wrap">
        <nav className="card flush" aria-label="People">
          <ul className="people" style={{ padding: "4px 0" }}>
            {people.map((p) => (
              <li key={p.phone} style={{ padding: 0, borderTop: "1px solid var(--line-soft)" }}>
                <Link href={`/dev?phone=${encodeURIComponent(p.phone)}`} style={{ display: "block", padding: "10px 16px", textDecoration: "none", color: "var(--ink)", background: p.phone === selected ? "var(--brand-tint)" : undefined, width: "100%" }}>
                  <strong>{p.name}</strong><span className="small muted" style={{ display: "block" }}>{prettyPhone(p.phone)}</span>
                </Link>
              </li>
            ))}
            {!people.length && <li style={{ padding: 16 }}>Add sitters first.</li>}
          </ul>
        </nav>
        <section className="card stack" aria-label="Conversation">
          <div className="bubbles">
            {[...convo].reverse().map((m) => (
              <div key={m.id} className={`bubble ${m.direction}`}>
                {m.body}
                <span className="ts">{fmtStamp(m.at, tz)}</span>
              </div>
            ))}
            {!convo.length && <p className="muted">No texts yet.</p>}
          </div>
          {selected && (
            <form action={sendAs.bind(null, selected)} className="row">
              <label style={{ flex: "1 1 240px" }}>
                <span style={{ position: "absolute", left: -9999 }}>Reply as this person</span>
                <input type="text" name="body" placeholder="Reply as them: 1, 2, 3, 4, DROP, JOIN…" autoComplete="off" />
              </label>
              <button className="btn primary" type="submit">Send</button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
