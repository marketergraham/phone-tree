import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { ProviderForm } from "../provider-form";
import { addAway, deleteProvider, removeAway } from "../actions";
import { twilioDisplay } from "../util";
import { DateTime } from "luxon";

const fmt = (d: string) => DateTime.fromISO(d).toFormat("LLL d");

export default async function EditProvider({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const db = getDb();
  const [p] = await db.select().from(schema.providers).where(eq(schema.providers.id, Number(id)));
  if (!p) notFound();
  const away = await db.select().from(schema.awayDates).where(eq(schema.awayDates.providerId, p.id)).orderBy(asc(schema.awayDates.startDate));
  return (
    <main className="page stack" style={{ maxWidth: 900 }}>
      <div>
        <Link href="/providers" className="back">← All providers</Link>
        <h1>{p.name}</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          {p.optedOut ? "Opted out: replied STOP. She can text START to rejoin."
            : p.joined ? `Joined ${p.joinedAt ? DateTime.fromJSDate(p.joinedAt).toFormat("LLL d, yyyy") : ""}`
            : `Hasn't joined yet. Ask her to text JOIN to ${twilioDisplay()}.`}
        </p>
      </div>
      <ProviderForm p={p} error={error} />

      <section className="card stack" aria-labelledby="away-h">
        <div>
          <h2 id="away-h">Away dates</h2>
          <p className="small muted" style={{ margin: "2px 0 0" }}>One-off exceptions. She won&apos;t be offered jobs on these days.</p>
        </div>
        <ul className="people">
          {away.map((a) => (
            <li key={a.id}>
              <span>{a.startDate === a.endDate ? fmt(a.startDate) : `${fmt(a.startDate)} – ${fmt(a.endDate)}`}</span>
              <form action={removeAway.bind(null, p.id, a.id)}><button className="btn sm" type="submit">Remove</button></form>
            </li>
          ))}
          {!away.length && <li className="muted">None.</li>}
        </ul>
        <form action={addAway.bind(null, p.id)} className="row" style={{ alignItems: "flex-end" }}>
          <label className="field" style={{ flex: "1 1 160px" }}>From<input type="date" name="start" required /></label>
          <label className="field" style={{ flex: "1 1 160px" }}>To (optional)<input type="date" name="end" /></label>
          <button className="btn" type="submit">Add away dates</button>
        </form>
      </section>

      <form action={deleteProvider.bind(null, p.id)}>
        <button className="btn danger" type="submit">Remove {p.name} from Phone Tree</button>
      </form>
    </main>
  );
}
