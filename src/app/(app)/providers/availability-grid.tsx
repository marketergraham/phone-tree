"use client";
import { useState } from "react";
import { SLOTS, WEEKDAYS } from "@/lib/time";

/** Tap cells, a whole day, or a whole time of day. Saved through a hidden field. */
export function AvailabilityGrid({ initial }: { initial: string[] }) {
  const [on, setOn] = useState(() => new Set(initial));
  const key = (d: number, s: string) => `${d}:${s}`;
  const toggleMany = (keys: string[]) => {
    const next = new Set(on);
    const anyOn = keys.some((k) => next.has(k));
    for (const k of keys) {
      if (anyOn) next.delete(k);
      else next.add(k);
    }
    setOn(next);
  };
  const all = WEEKDAYS.flatMap((_, i) => SLOTS.map((s) => key(i + 1, s.key)));
  return (
    <div>
      <input type="hidden" name="availability" value={JSON.stringify([...on])} />
      <div className="scroll-x">
        <table className="avail">
          <thead>
            <tr>
              <th scope="col"><span className="sr-only" style={{ position: "absolute", left: -9999 }}>Time of day</span></th>
              {WEEKDAYS.map((d, i) => (
                <th key={d} scope="col">
                  <button type="button" className="rowhead" style={{ textAlign: "center", fontWeight: 600 }}
                    onClick={() => toggleMany(SLOTS.map((s) => key(i + 1, s.key)))}>{d}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SLOTS.map((s) => (
              <tr key={s.key}>
                <th scope="row" style={{ width: 140 }}>
                  <button type="button" className="rowhead" onClick={() => toggleMany(WEEKDAYS.map((_, i) => key(i + 1, s.key)))}>
                    <strong style={{ display: "block" }}>{s.label}</strong>
                    <span className="small muted">{s.hours}</span>
                  </button>
                </th>
                {WEEKDAYS.map((d, i) => {
                  const k = key(i + 1, s.key);
                  const pressed = on.has(k);
                  return (
                    <td key={k}>
                      <button type="button" aria-pressed={pressed} aria-label={`${d} ${s.label}`} onClick={() => toggleMany([k])}>
                        {pressed ? "✓" : ""}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button type="button" className="btn sm" onClick={() => setOn(new Set(all))}>Available anytime</button>
        <button type="button" className="btn sm" onClick={() => setOn(new Set())}>Clear</button>
        <span className="small muted">{on.size} of 35 time slots · midnight–5 am counts as the night before&apos;s late evening</span>
      </div>
    </div>
  );
}
