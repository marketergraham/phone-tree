import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { loadCtx } from "@/lib/engine/context";
import { jobDetail, jobWhen } from "@/lib/views";
import { money } from "@/lib/time";
import {
  askUnavailableAction, cancelJobAction, nudgeAction, pauseAction, reopenAction, sitterCanceledAction, textEveryoneAction,
} from "../actions";
import { ConfirmButton } from "./confirm-button";

export const dynamic = "force-dynamic";

const TAG: Record<string, string> = {
  you: "You", sent: "Sent", reply: "Reply", reminder: "Reminder", booked: "Booked", canceled: "Canceled", closed: "Closed", info: "Note",
};
const MODE: Record<string, string> = {
  none: "Not asked", end: "Asked at the end", start: "Included from the start",
};

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadCtx();
  const [job] = await ctx.db.select().from(schema.jobs).where(eq(schema.jobs.id, Number(id)));
  if (!job) notFound();
  if (job.status === "draft") redirect(`/jobs/${job.id}/edit`);
  const v = await jobDetail(ctx, job);
  const w = jobWhen(ctx, job);
  const live = job.status === "open" && job.endsAt > ctx.now;
  const next = v.future[0];

  return (
    <main className="page stack">
      <Link href="/jobs" className="back">← All jobs</Link>
      <section className="card stack">
        <div className="row between" style={{ alignItems: "flex-start" }}>
          <div>
            <div className="row" style={{ gap: 8 }}>
              <span className={`pill ${v.status.tone}`}>{v.status.label}</span>
              <span className="pill plain">One-time · job {job.code}</span>
            </div>
            <h1 style={{ marginTop: 10 }}>{w.day} · {w.time}</h1>
            <p className="muted" style={{ margin: "2px 0 0" }}>
              {ctx.hh.houseName}{job.kids ? ` · ${job.kids}` : ""} · {job.rateCents != null ? `${money(job.rateCents)}/hr` : "Each sitter's own rate"}
            </p>
          </div>
          <div className="row" style={{ gap: 8 }}>
            {live && (
              <form action={pauseAction.bind(null, job.id, !job.paused)}><button className="btn" type="submit">{job.paused ? "Resume" : "Pause"}</button></form>
            )}
            {job.status === "booked" && job.endsAt > ctx.now && (
              <ConfirmButton action={sitterCanceledAction.bind(null, job.id)} label="Sitter canceled"
                confirm="Mark the sitter as canceled? The job reopens: backups get first dibs, then everyone who didn't say no." />
            )}
            {job.status === "closed" && job.startsAt > ctx.now && (
              <form action={reopenAction.bind(null, job.id)}><button className="btn primary" type="submit">Keep offering until it starts</button></form>
            )}
            {["open", "booked", "closed"].includes(job.status) && job.endsAt > ctx.now && (
              <ConfirmButton action={cancelJobAction.bind(null, job.id)} label="Cancel job" danger
                confirm="Cancel this job? The booked sitter, anyone still deciding, and backups get a text." />
            )}
            {live && (
              <ConfirmButton action={textEveryoneAction.bind(null, job.id)} label="Text everyone now" primary
                confirm="Send to all remaining tiers right now, and re-text everyone who hasn't answered?" />
            )}
          </div>
        </div>
        {next && (
          <div className="nextup">
            <span className="k">Next up</span>
            <strong>{next.stamp}</strong>
            <span>{next.text}</span>
          </div>
        )}
        <div className="grid4">
          <div className="stat"><span className="small muted">Texted</span><b>{v.stats.texted}</b></div>
          <div className="stat" style={{ background: "var(--warm-tint)" }}><span className="small" style={{ color: "#6b4a20" }}>Maybe</span><b>{v.stats.maybe}</b></div>
          <div className="stat"><span className="small muted">No reply</span><b>{v.stats.waiting}</b></div>
          <div className="stat" style={{ background: "var(--brand-tint)" }}><span className="small" style={{ color: "var(--brand-dark)" }}>Backups</span><b>{v.stats.backups}</b></div>
        </div>
      </section>

      <div className="cols">
        <section className="card main-col" aria-labelledby="tl-h">
          <div className="row between" style={{ marginBottom: 16 }}>
            <h2 id="tl-h">Timeline</h2>
            <span className="small muted">Every text, reply and automatic step. Upcoming steps stop the moment someone replies 1.</span>
          </div>
          <ol className="tl">
            {v.past.map((e) => (
              <li key={`p${e.id}`}>
                <span className="t">{e.stamp}</span>
                <span className="m"><span className={`dot ${e.kind}`} /></span>
                <span><span className={`tag ${e.kind}`}>{TAG[e.kind]}</span>{e.text}{e.detail && <span className="d">{e.detail}</span>}</span>
              </li>
            ))}
            {(v.future.length > 0 || live) && (
              <li className="now">
                <span className="t">Now · {v.nowStamp.split(" · ")[1]}</span>
                <span className="m"><span className="nowdot" /></span>
                <span className="bar" />
              </li>
            )}
            {v.future.map((f, i) => (
              <li key={`f${i}`}>
                <span className="t" style={i === 0 ? { color: "var(--ink)", fontWeight: 600 } : undefined}>{f.stamp}</span>
                <span className="m"><span className={`dot ${i === 0 ? "next" : "future"}`} /></span>
                <span className="future-text"><span className={`tag ${i === 0 ? "next" : "planned"}`}>{i === 0 ? "Next up" : "Planned"}</span>{f.text}{f.detail && <span className="d">{f.detail}</span>}</span>
              </li>
            ))}
          </ol>
        </section>

        <aside className="side-col stack">
          <section className="card" aria-labelledby="sit-h">
            <h2 id="sit-h" style={{ marginBottom: 8 }}>Sitters</h2>
            <ul className="people">
              {v.sitters.map((s) => (
                <li key={s.offerId}>
                  <span>
                    <strong>{s.name}</strong> <span className="small muted">· T{s.tier}{s.rate ? ` · ${s.rate}` : ""}</span>
                    <span className="small muted" style={{ display: "block" }}>Texted {s.sentAt}{s.outsideUsual ? " · outside usual hours" : ""}</span>
                  </span>
                  <span className="row" style={{ gap: 6 }}>
                    {s.canNudge && (
                      <form action={nudgeAction.bind(null, job.id, s.offerId)}><button className="btn sm" type="submit">Nudge</button></form>
                    )}
                    <span className={`pill ${s.reply.tone}`}>{s.reply.text}</span>
                  </span>
                </li>
              ))}
              {v.notAsked.map((n) => (
                <li key={`n${n.name}`}>
                  <span><strong>{n.name}</strong><span className="small muted" style={{ display: "block" }}>{n.why}</span></span>
                  <span className="pill" style={{ background: "var(--bg)", border: "1px dashed #a9b0ab" }}>Not yet</span>
                </li>
              ))}
              {!v.sitters.length && !v.notAsked.length && <li className="muted">No sitters yet.</li>}
            </ul>
            {v.canAskUnavailable && (
              <form action={askUnavailableAction.bind(null, job.id)} style={{ marginTop: 12 }}>
                <button className="btn sm" type="submit" style={{ whiteSpace: "normal", maxWidth: "100%" }}>Ask the usually-unavailable ones now</button>
              </form>
            )}
          </section>

          <section className="card" aria-labelledby="set-h">
            <h2 id="set-h" style={{ marginBottom: 12 }}>How it&apos;s being offered</h2>
            <dl className="facts">
              <dt>Rollout</dt><dd>Tier 1 → Tier 2 after {job.tierWaits[0]} h → Tier 3 after {job.tierWaits[1]} h</dd>
              <dt>Not usually free then</dt><dd>{MODE[job.unavailableMode]}{job.unavailableMode === "end" ? `, ${job.unavailableWaitHours} h after Tier 3` : ""}</dd>
              <dt>Reminders</dt><dd>{job.remindEveryHours ? `Every ${job.remindEveryHours} h, up to ${job.remindMax} (${job.remindersSent} sent)` : "Off"}</dd>
              <dt>If the sitter cancels</dt><dd>Backups get a {job.headStartMinutes} min head start, then recruiting picks up where it left off</dd>
              <dt>Texting hours</dt><dd>{job.allowAnyHour ? "Any time" : "Respected (except jobs within 12 hours)"}</dd>
              <dt>Stops offering</dt><dd>{job.closeBeforeHours} h before it starts, if unclaimed</dd>
              {job.note && <><dt>Note for the sitter</dt><dd>{job.note}</dd></>}
            </dl>
          </section>
        </aside>
      </div>
    </main>
  );
}
