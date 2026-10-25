import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireParent, signOut } from "@/lib/auth";
import { getHousehold } from "@/lib/engine/context";
import { normalizePhone, prettyPhone } from "@/lib/time";
import { smsDriver } from "@/lib/sms";

const toMin = (s: string, d: number) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  return m ? Number(m[1]) * 60 + Number(m[2]) : d;
};
const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

async function saveHousehold(form: FormData) {
  "use server";
  await requireParent();
  const db = getDb();
  const hh = await getHousehold(db);
  await db.update(schema.household).set({
    displayName: String(form.get("displayName") ?? "").trim() || hh.displayName,
    houseName: String(form.get("houseName") ?? "").trim() || hh.houseName,
    textingStartMin: toMin(String(form.get("start")), hh.textingStartMin),
    textingEndMin: toMin(String(form.get("end")), hh.textingEndMin),
  }).where(eq(schema.household.id, hh.id));
  revalidatePath("/settings");
  redirect("/settings?saved=1");
}

async function addParent(form: FormData) {
  "use server";
  await requireParent();
  const phone = normalizePhone(String(form.get("phone") ?? ""));
  const name = String(form.get("name") ?? "").trim();
  if (!phone || !name) redirect("/settings?error=parent");
  await getDb().insert(schema.parents).values({ name, phone }).onConflictDoNothing();
  revalidatePath("/settings");
}

async function toggleAlerts(id: number, alerts: boolean) {
  "use server";
  await requireParent();
  await getDb().update(schema.parents).set({ alerts }).where(eq(schema.parents.id, id));
  revalidatePath("/settings");
}

async function removeParent(id: number) {
  "use server";
  const me = await requireParent();
  if (me.id === id) return;
  await getDb().delete(schema.parents).where(eq(schema.parents.id, id));
  revalidatePath("/settings");
}

async function logout() {
  "use server";
  await signOut();
  redirect("/login");
}

export default async function Settings({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const me = await requireParent();
  const { saved, error } = await searchParams;
  const db = getDb();
  const hh = await getHousehold(db);
  const parents = await db.select().from(schema.parents).orderBy(asc(schema.parents.id));
  const number = process.env.TWILIO_FROM_NUMBER;
  return (
    <main className="page stack" style={{ maxWidth: 900 }}>
      <div className="row between">
        <h1>Settings</h1>
        <form action={logout}><button className="btn" type="submit">Sign out</button></form>
      </div>
      {saved && <p className="flash" role="status">Saved.</p>}

      <form action={saveHousehold} className="card stack" aria-labelledby="hh-h">
        <h2 id="hh-h">Household &amp; texting hours</h2>
        <div className="grid2">
          <label className="field">Name in texts<input type="text" name="displayName" defaultValue={hh.displayName} /></label>
          <label className="field">House name <span className="hint">Used instead of an address</span><input type="text" name="houseName" defaultValue={hh.houseName} /></label>
          <label className="field">Texting hours start<input type="time" name="start" defaultValue={toHHMM(hh.textingStartMin)} /></label>
          <label className="field">Texting hours end<input type="time" name="end" defaultValue={toHHMM(hh.textingEndMin)} /></label>
        </div>
        <p className="small muted" style={{ margin: 0 }}>Time zone: {hh.timezone}</p>
        <div><button className="btn primary" type="submit">Save</button></div>
      </form>

      <section className="card stack" aria-labelledby="par-h">
        <div>
          <h2 id="par-h">Parents</h2>
          <p className="small muted" style={{ margin: "2px 0 0" }}>These numbers can sign in and get text alerts: bookings, cancellations, unclaimed jobs and questions from sitters.</p>
        </div>
        {error === "parent" && <p className="err" role="alert">Enter a name and a US mobile number.</p>}
        <ul className="people">
          {parents.map((p) => (
            <li key={p.id}>
              <span><strong>{p.name}</strong> <span className="muted">{prettyPhone(p.phone)}</span>{p.id === me.id && <span className="small muted"> · you</span>}</span>
              <span className="row" style={{ gap: 6 }}>
                <form action={toggleAlerts.bind(null, p.id, !p.alerts)}>
                  <button className="btn sm" type="submit">{p.alerts ? "Alerts on" : "Alerts off"}</button>
                </form>
                {p.id !== me.id && <form action={removeParent.bind(null, p.id)}><button className="btn sm danger" type="submit">Remove</button></form>}
              </span>
            </li>
          ))}
        </ul>
        <form action={addParent} className="row" style={{ alignItems: "flex-end" }}>
          <label className="field" style={{ flex: "1 1 160px" }}>Name<input type="text" name="name" /></label>
          <label className="field" style={{ flex: "1 1 200px" }}>Mobile<input type="tel" name="phone" /></label>
          <button className="btn" type="submit">Add parent</button>
        </form>
      </section>

      <section className="card stack" aria-labelledby="tw-h">
        <h2 id="tw-h">Texting</h2>
        <dl className="facts">
          <dt>Mode</dt><dd>{smsDriver() === "twilio" ? "Live: texts go out through Twilio" : "Test mode: no real texts are sent"}</dd>
          <dt>Phone Tree number</dt><dd>{number ? prettyPhone(number) : "Not set"}</dd>
        </dl>
        <p className="small muted" style={{ margin: 0 }}>Google Calendar sync is coming in a later update.</p>
      </section>
    </main>
  );
}
