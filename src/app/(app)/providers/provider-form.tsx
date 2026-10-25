import { saveProvider } from "./actions";
import { AvailabilityGrid } from "./availability-grid";
import { prettyPhone } from "@/lib/time";

type P = {
  id?: number; name: string; phone: string; rateCents: number | null; tier: number; availability: string[];
  active: boolean; joined: boolean; optedOut: boolean; notes: string | null;
};

export function ProviderForm({ p, error }: { p?: P; error?: string }) {
  return (
    <form action={saveProvider} className="card stack">
      <input type="hidden" name="id" value={p?.id ?? ""} />
      {error === "phone" && <p className="err" role="alert">Please enter a US mobile number.</p>}
      {error === "name" && <p className="err" role="alert">Please enter a name.</p>}
      {error === "dup" && <p className="err" role="alert">Another sitter already has that phone number.</p>}
      <div className="grid2">
        <label className="field">Name <span className="hint">As it should appear in texts and on job pages</span>
          <input type="text" name="name" required defaultValue={p?.name} placeholder="Maya R." />
        </label>
        <label className="field">Mobile number
          <input type="tel" name="phone" required defaultValue={p ? prettyPhone(p.phone) : ""} placeholder="(925) 555-0142" />
        </label>
        <label className="field">Standard hourly rate <span className="hint">Used when a job doesn&apos;t set its own</span>
          <input type="text" name="rate" inputMode="decimal" defaultValue={p?.rateCents != null ? String(p.rateCents / 100) : ""} placeholder="25" />
        </label>
        <label className="field">Tier <span className="hint">Tier 1 hears about jobs first</span>
          <select name="tier" defaultValue={String(p?.tier ?? 1)}>
            <option value="1">Tier 1</option><option value="2">Tier 2</option><option value="3">Tier 3</option>
          </select>
        </label>
      </div>

      <div>
        <h2 style={{ marginBottom: 4 }}>Usual availability</h2>
        <p className="small muted" style={{ margin: "0 0 8px" }}>Tap a cell to toggle it. Tap a day or a time of day to toggle the whole column or row.</p>
        <AvailabilityGrid initial={p?.availability ?? []} />
      </div>

      <label className="field">Notes (only you see these)
        <textarea name="notes" rows={2} defaultValue={p?.notes ?? ""} />
      </label>

      <div className="stack" style={{ gap: 8, paddingTop: 12, borderTop: "1px solid var(--line-soft)" }}>
        <label className="row" style={{ gap: 10 }}>
          <input type="checkbox" name="active" defaultChecked={p?.active ?? true} style={{ width: 20, height: 20, accentColor: "var(--brand)" }} />
          Active (offer jobs to this sitter)
        </label>
        {!p?.joined && (
          <label className="row" style={{ gap: 10, alignItems: "flex-start" }}>
            <input type="checkbox" name="markJoined" style={{ width: 20, height: 20, marginTop: 2, accentColor: "var(--brand)" }} />
            <span>They&apos;ve agreed to get texts from Phone Tree<br />
              <span className="small muted">Best practice: have them text JOIN to your Phone Tree number instead. That records their consent automatically.</span></span>
          </label>
        )}
      </div>
      <div className="row"><button className="btn primary" type="submit">Save</button></div>
    </form>
  );
}
