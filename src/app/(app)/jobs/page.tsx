import Link from "next/link";
import { loadCtx } from "@/lib/engine/context";
import { listJobs } from "@/lib/views";

type Item = Awaited<ReturnType<typeof listJobs>>[number];

function Row({ it }: { it: Item }) {
  const href = it.job.status === "draft" ? `/jobs/${it.job.id}/edit` : `/jobs/${it.job.id}`;
  return (
    <Link className="jobrow" href={href}>
      <span className="when"><strong style={{ display: "block" }}>{it.when.day}</strong><span className="muted">{it.when.time}</span></span>
      <span className="status"><span className={`pill ${it.status.tone}`}>{it.status.label}</span> <span className="muted">{it.summary && `· ${it.summary}`}</span></span>
      {it.next && <span className="next">{it.next}</span>}
      <span aria-hidden="true" style={{ color: "#a9b0ab", fontSize: 20 }}>›</span>
    </Link>
  );
}

function Group({ title, items }: { title: string; items: Item[] }) {
  if (!items.length) return null;
  return (
    <section className="card flush joblist" aria-label={title}>
      <h2 className="card-title">{title} <span className="muted" style={{ fontWeight: 400 }}>· {items.length}</span></h2>
      {items.map((it) => <Row key={it.job.id} it={it} />)}
    </section>
  );
}

export default async function Jobs({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { show } = await searchParams;
  const past = show === "past";
  const ctx = await loadCtx();
  const items = await listJobs(ctx, past);
  return (
    <main className="page stack">
      <div className="row between">
        <h1>Jobs</h1>
        <div className="row">
          <nav className="row" aria-label="Show" style={{ gap: 4, background: "#e6e9e3", borderRadius: 10, padding: 3 }}>
            <Link href="/jobs" className="btn sm" aria-current={!past ? "page" : undefined} style={{ border: 0, background: past ? "transparent" : "#fff", fontWeight: past ? 400 : 600 }}>Upcoming</Link>
            <Link href="/jobs?show=past" className="btn sm" aria-current={past ? "page" : undefined} style={{ border: 0, background: past ? "#fff" : "transparent", fontWeight: past ? 600 : 400 }}>Past</Link>
          </nav>
          <Link href="/jobs/new" className="btn primary">+ New job</Link>
        </div>
      </div>
      {past ? (
        <Group title="Past and canceled" items={items} />
      ) : (
        <>
          <Group title="Open" items={items.filter((i) => i.job.status === "open")} />
          <Group title="Closed, unfilled" items={items.filter((i) => i.job.status === "closed")} />
          <Group title="Booked" items={items.filter((i) => i.job.status === "booked")} />
          <Group title="Drafts" items={items.filter((i) => i.job.status === "draft")} />
        </>
      )}
      {!items.length && (
        <div className="card">
          <p style={{ margin: 0 }}>{past ? "No past jobs yet." : "No upcoming jobs."} {!past && <Link href="/jobs/new">Create one</Link>}</p>
        </div>
      )}
    </main>
  );
}
