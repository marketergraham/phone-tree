import Link from "next/link";
import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { money, prettyPhone, twilioDisplay } from "./util";

export default async function Providers({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await searchParams;
  const list = await getDb().select().from(schema.providers).orderBy(asc(schema.providers.tier), asc(schema.providers.name));
  const groups = [1, 2, 3].map((t) => ({ t, people: list.filter((p) => p.tier === t) }));
  return (
    <main className="page stack">
      <div className="row between">
        <h1>Providers</h1>
        <Link href="/providers/new" className="btn primary">+ Add sitter</Link>
      </div>
      {saved && <p className="flash" role="status">Saved.</p>}
      <p className="muted" style={{ margin: 0 }}>
        New sitters need to text <strong>JOIN</strong> to {twilioDisplay()} before Phone Tree will text them.
      </p>
      {groups.map((g) => (
        <section key={g.t} className="card flush joblist" aria-label={`Tier ${g.t}`}>
          <h2 className="card-title">Tier {g.t} <span className="muted" style={{ fontWeight: 400 }}>· {g.people.length}</span></h2>
          {g.people.map((p) => (
            <Link key={p.id} href={`/providers/${p.id}`} className="jobrow">
              <span className="when"><strong style={{ display: "block" }}>{p.name}</strong><span className="muted">{prettyPhone(p.phone)}</span></span>
              <span className="status">
                {!p.active ? <span className="pill">Inactive</span>
                  : p.optedOut ? <span className="pill red">Opted out</span>
                  : !p.joined ? <span className="pill open">Hasn&apos;t texted JOIN</span>
                  : <span className="pill booked">Ready</span>}
                <span className="muted"> · {money(p.rateCents) ? `${money(p.rateCents)}/hr` : "No rate"} · {p.availability.length} of 35 slots</span>
              </span>
              <span aria-hidden="true" style={{ color: "#a9b0ab", fontSize: 20 }}>›</span>
            </Link>
          ))}
          {!g.people.length && <p className="muted" style={{ padding: "0 20px 16px", margin: 0 }}>Nobody in this tier.</p>}
        </section>
      ))}
    </main>
  );
}
