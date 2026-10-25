"use client";
import { useMemo, useState } from "react";
import { DateTime } from "luxon";
import { saveJob } from "./actions";
import { describeSlots, jobSlots, nextTextingTime, insideTextingHours } from "@/lib/time";

type P = { name: string; tier: number; availability: string[]; rate: string | null; ready: boolean };
type Defaults = {
  jobId?: number; date: string; start: string; end: string; rate: string; kids: string; note: string;
  wait2: number; wait3: number; unavailableMode: string; unavailableWait: number; remindEvery: number;
  remindMax: number; allowAnyHour: boolean; closeBefore: number;
};

const TIER_COLORS = ["#1f6f66", "#3e7fa6", "#7a6aa8"];
const MODES = [
  { v: "none", label: "Don't ask", desc: "Only sitters who are usually free get this job" },
  { v: "end", label: "Ask at the end", desc: "After the last tier, if it's still open" },
  { v: "start", label: "Include from the start", desc: "Texted with their own tier, like everyone else" },
];

export function JobForm({ providers, tz, startMin, endMin, nowIso, d, error }: {
  providers: P[]; tz: string; startMin: number; endMin: number; nowIso: string; d: Defaults; error?: string;
}) {
  const [date, setDate] = useState(d.date);
  const [start, setStart] = useState(d.start);
  const [end, setEnd] = useState(d.end);
  const [w2, setW2] = useState(d.wait2);
  const [w3, setW3] = useState(d.wait3);
  const [mode, setMode] = useState(d.unavailableMode);
  const [uw, setUw] = useState(d.unavailableWait);
  const [remind, setRemind] = useState(d.remindEvery);
  const [anyHour, setAnyHour] = useState(d.allowAnyHour);
  const [closeBefore, setCloseBefore] = useState(d.closeBefore);

  const calc = useMemo(() => {
    const s = DateTime.fromISO(`${date}T${start}`, { zone: tz });
    let e = DateTime.fromISO(`${date}T${end}`, { zone: tz });
    if (!s.isValid || !e.isValid) return null;
    if (e <= s) e = e.plus({ days: 1 });
    const slots = jobSlots(s.toJSDate(), e.toJSDate(), tz);
    const ready = providers.filter((p) => p.ready);
    const tiers = [1, 2, 3].map((t) => {
      const inTier = ready.filter((p) => p.tier === t);
      const usual = inTier.filter((p) => slots.every((k) => p.availability.includes(k)));
      const unusual = inTier.filter((p) => !usual.includes(p));
      return { t, usual, unusual, send: mode === "start" ? inTier : usual };
    });
    const unusualAll = tiers.flatMap((x) => x.unusual);
    const missingDesc = (p: P) => describeSlots(slots.filter((k) => !p.availability.includes(k)));

    // Rollout plan preview.
    const hours = { tz, startMin, endMin };
    const now = new Date(nowIso);
    const fit = (at: Date) => {
      if (anyHour || s.toJSDate().getTime() - at.getTime() < 12 * 3600_000) return at;
      return insideTextingHours(at, hours) ? at : nextTextingTime(at, hours);
    };
    const fmt = (x: Date) => DateTime.fromJSDate(x, { zone: tz }).toFormat("ccc M/d · h:mm a").replace("AM", "am").replace("PM", "pm");
    const plan: { when: string; what: string; color: string }[] = [];
    let held = false;
    let t = fit(now);
    if (t > now) held = true;
    plan.push({ when: fmt(t), what: `Tier 1 texted (${tiers[0].send.length})`, color: "#5fb3a8" });
    if (remind > 0) plan.push({ when: fmt(fit(new Date(t.getTime() + remind * 3600_000))), what: "Reminder to anyone who hasn't said no", color: "#8e9691" });
    const waits = [w2, w3];
    for (let i = 1; i < 3; i++) {
      const raw = new Date(t.getTime() + (tiers[i - 1].send.length ? waits[i - 1] : 0) * 3600_000);
      t = fit(raw);
      if (t > raw) held = true;
      plan.push({ when: fmt(t), what: `Tier ${i + 1} added (${tiers[i].send.length})`, color: i === 1 ? "#7fb1d1" : "#b3a6d6" });
    }
    if (mode === "end" && unusualAll.length) {
      const raw = new Date(t.getTime() + uw * 3600_000);
      const at = fit(raw);
      if (at > raw) held = true;
      plan.push({ when: fmt(at), what: `${unusualAll.map((p) => p.name).join(", ")} asked, just in case`, color: "#e8d3b4" });
    }
    const closeAt = s.minus({ hours: closeBefore }).toJSDate();
    plan.push({ when: fmt(closeAt), what: "Stops offering if unclaimed; you get a text", color: "#f2b66d" });
    const sorted = plan.filter((p) => p).slice();
    return { tiers, unusualAll, missingDesc, plan: sorted, held, past: s.toJSDate() <= now, slots };
  }, [date, start, end, w2, w3, mode, uw, remind, anyHour, closeBefore, providers, tz, startMin, endMin, nowIso]);

  const total = providers.filter((p) => p.ready).length;
  const sending = calc ? calc.tiers.reduce((a, x) => a + x.send.length, 0) : 0;

  return (
    <form action={saveJob} className="cols">
      <input type="hidden" name="jobId" value={d.jobId ?? ""} />
      <div className="main-col stack">
        {error === "past" && <p className="err" role="alert">That time has already passed. Pick a time in the future.</p>}
        {error === "time" && <p className="err" role="alert">Please enter a valid date and time.</p>}
        <section className="card stack" aria-labelledby="when-h">
          <h2 id="when-h">When</h2>
          <div className="grid3">
            <label className="field">Date<input type="date" name="date" required value={date} onChange={(e) => setDate(e.target.value)} /></label>
            <label className="field">Start<input type="time" name="start" required value={start} onChange={(e) => setStart(e.target.value)} /></label>
            <label className="field">End<input type="time" name="end" required value={end} onChange={(e) => setEnd(e.target.value)} /></label>
          </div>
          <p className="small muted" style={{ margin: 0 }}>Weekly jobs are coming in the next update.</p>
        </section>

        <section className="card stack" aria-labelledby="pay-h">
          <h2 id="pay-h">Pay &amp; details</h2>
          <div className="grid2">
            <label className="field">Hourly rate <span className="hint">Leave blank to use each sitter&apos;s own rate</span>
              <input type="text" name="rate" inputMode="decimal" defaultValue={d.rate} placeholder="Sitter's standard rate" />
            </label>
            <label className="field">Kids <span className="hint">Shown in the text</span>
              <input type="text" name="kids" defaultValue={d.kids} placeholder="2 kids (4 and 7)" />
            </label>
          </div>
          <label className="field">Note for the sitter <span className="hint">Sent with the booking confirmation and the day-of reminder</span>
            <textarea name="note" rows={2} defaultValue={d.note} placeholder="Bedtime 8pm, pizza money on the counter" />
          </label>
        </section>

        <section className="card stack" aria-labelledby="who-h">
          <div className="row between">
            <h2 id="who-h">Who gets it, and when</h2>
            <span className="small muted">{sending} of {total} sitters in the first rounds</span>
          </div>
          <ol className="tiers">
            {calc?.tiers.map((x, i) => (
              <li key={x.t}>
                <span className="tierbadge" style={{ background: TIER_COLORS[i] }}>Tier {x.t}</span>
                <span style={{ flex: "1 1 220px", minWidth: 0 }}>
                  <strong style={{ display: "block" }}>{x.send.length ? x.send.map((p) => p.name).join(", ") : "No one"}</strong>
                  <span className="small muted">
                    {x.unusual.length
                      ? x.unusual.map((p) => `${p.name} ${mode === "start" ? "included, though" : mode === "end" ? "asked at the end:" : "not asked:"} not usually free ${calc.missingDesc(p)}`).join(" · ")
                      : x.send.length ? "Everyone in this tier is usually free then" : "Nobody in this tier yet"}
                  </span>
                </span>
                {i === 0 ? <strong style={{ color: "var(--brand-dark)" }}>Sent right away</strong> : (
                  <label className="row" style={{ gap: 8 }}>after
                    <input type="number" min={0} max={168} style={{ width: 80 }} name={`wait${x.t}`} value={i === 1 ? w2 : w3}
                      onChange={(e) => (i === 1 ? setW2 : setW3)(Number(e.target.value))} aria-label={`Hours before Tier ${x.t}`} />
                    hours</label>
                )}
              </li>
            ))}
          </ol>
          <fieldset style={{ border: 0, padding: "14px 0 0", margin: 0, borderTop: "1px solid var(--line-soft)" }}>
            <legend style={{ fontWeight: 600, padding: 0 }}>Sitters who aren&apos;t usually free at this time</legend>
            <p className="small muted" style={{ margin: "4px 0 12px" }}>
              Based on each sitter&apos;s weekly availability.
              {calc && calc.unusualAll.length ? ` For this job: ${calc.unusualAll.map((p) => p.name).join(", ")}.` : " Everyone is usually free for this job."}
            </p>
            <div className="seg">
              {MODES.map((m) => (
                <label key={m.v}>
                  <input type="radio" name="unavailableMode" value={m.v} checked={mode === m.v} onChange={() => setMode(m.v)} />
                  <strong style={{ display: "block" }}>{m.label}</strong>
                  <span className="small muted">{m.desc}</span>
                </label>
              ))}
            </div>
            {mode === "end" && (
              <label className="row" style={{ gap: 8, marginTop: 12 }}>Ask them
                <input type="number" name="unavailableWait" min={0} max={72} style={{ width: 80 }} value={uw} onChange={(e) => setUw(Number(e.target.value))} />
                hours after the last tier</label>
            )}
            {mode !== "end" && <input type="hidden" name="unavailableWait" value={uw} />}
            <p className="small muted" style={{ margin: "12px 0 0" }}>
              This only changes <em>who</em> is asked. Tier order, wait times, reminders and texting hours stay the same. Away dates are always respected.
            </p>
          </fieldset>
        </section>

        <section className="card stack" aria-labelledby="rem-h">
          <h2 id="rem-h">Reminders &amp; texting hours</h2>
          <div className="row">
            <label className="row" style={{ gap: 8 }}>Remind everyone who hasn&apos;t said no every
              <input type="number" name="remindEvery" min={0} max={72} style={{ width: 80 }} value={remind} onChange={(e) => setRemind(Number(e.target.value))} /> hours</label>
            <label className="row" style={{ gap: 8 }}>up to
              <input type="number" name="remindMax" min={0} max={10} style={{ width: 72 }} defaultValue={d.remindMax} /> times</label>
          </div>
          <label className="row" style={{ gap: 10, paddingTop: 12, borderTop: "1px solid var(--line-soft)", alignItems: "flex-start" }}>
            <input type="checkbox" name="allowAnyHour" checked={anyHour} onChange={(e) => setAnyHour(e.target.checked)} style={{ width: 20, height: 20, marginTop: 2, accentColor: "var(--brand)" }} />
            <span><strong>Allow texts outside texting hours</strong><br /><span className="small muted">Off: anything due overnight waits until morning. Jobs starting within 12 hours always go out right away.</span></span>
          </label>
          <label className="row" style={{ gap: 8, paddingTop: 12, borderTop: "1px solid var(--line-soft)" }}>If nobody&apos;s claimed it
            <select name="closeBefore" style={{ width: "auto" }} value={closeBefore} onChange={(e) => setCloseBefore(Number(e.target.value))}>
              {[0, 2, 4, 6, 12, 24].map((h) => <option key={h} value={h}>{h === 0 ? "right" : `${h} hours`}</option>)}
            </select>
            before it starts, stop offering it and text me</label>
        </section>
      </div>

      <aside className="side-col plan" aria-labelledby="plan-h">
        <h2 id="plan-h">Rollout plan</h2>
        <p className="small" style={{ color: "#b9c2bd", margin: "4px 0 0" }}>If you send now. Everything stops the moment someone replies 1.</p>
        <ol>
          {calc?.plan.map((p, i) => (
            <li key={i}><span className="pdot" style={{ background: p.color }} aria-hidden="true" />
              <span><span className="pw">{p.when}</span><span style={{ fontWeight: 500 }}>{p.what}</span></span></li>
          ))}
        </ol>
        {calc?.held && <p className="small" style={{ margin: "16px 0 0", padding: "10px 12px", borderRadius: 8, background: "#2b3431", color: "#e8d3b4" }}>Some steps wait for texting hours.</p>}
        {calc?.past && <p className="small" style={{ margin: "16px 0 0", padding: "10px 12px", borderRadius: 8, background: "#5a2a22", color: "#fbe9e7" }}>This time is in the past.</p>}
        <div className="stack" style={{ gap: 10, marginTop: 22 }}>
          <button type="submit" name="intent" value="send" className="btn warm">Send to Tier 1</button>
          <button type="submit" name="intent" value="draft" className="btn" style={{ background: "transparent", color: "#f4f5f1", borderColor: "#56615c" }}>Save as draft</button>
        </div>
      </aside>
    </form>
  );
}
