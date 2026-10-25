import { redirect } from "next/navigation";
import { requestCode, verifyCode, currentParent } from "@/lib/auth";
import { smsDriver } from "@/lib/sms";
import { prettyPhone } from "@/lib/time";
import { Logo } from "@/app/(app)/logo";

export const dynamic = "force-dynamic";

async function sendCode(form: FormData) {
  "use server";
  const r = await requestCode(String(form.get("phone") ?? ""));
  if (!r.ok || !r.phone) redirect("/login?error=phone");
  redirect(`/login?phone=${encodeURIComponent(r.phone)}`);
}

async function checkCode(form: FormData) {
  "use server";
  const phone = String(form.get("phone") ?? "");
  const ok = await verifyCode(phone, String(form.get("code") ?? ""));
  if (!ok) redirect(`/login?phone=${encodeURIComponent(phone)}&error=code`);
  redirect("/jobs");
}

export default async function Login({ searchParams }: { searchParams: Promise<{ phone?: string; error?: string }> }) {
  if (await currentParent()) redirect("/jobs");
  const { phone, error } = await searchParams;
  const fake = smsDriver() === "fake";
  return (
    <main className="page" style={{ maxWidth: 440, paddingTop: 64 }}>
      <div className="stack">
        <div className="brand"><Logo /><span>Phone Tree</span></div>
        <div className="card stack">
          {!phone ? (
            <form action={sendCode} className="stack">
              <h1 style={{ fontSize: 28 }}>Sign in</h1>
              <p className="muted" style={{ margin: 0 }}>We&apos;ll text you a 6-digit code.</p>
              {error === "phone" && <p className="err" role="alert">That doesn&apos;t look like a US mobile number.</p>}
              <label className="field">Your mobile number
                <input type="tel" name="phone" autoComplete="tel" required placeholder="(510) 555-0100" />
              </label>
              <button className="btn primary" type="submit">Text me a code</button>
            </form>
          ) : (
            <form action={checkCode} className="stack">
              <h1 style={{ fontSize: 28 }}>Enter your code</h1>
              <p className="muted" style={{ margin: 0 }}>If {prettyPhone(phone)} is one of the parent numbers, a code is on its way.</p>
              {error === "code" && <p className="err" role="alert">That code didn&apos;t work. Check it, or get a new one.</p>}
              <input type="hidden" name="phone" value={phone} />
              <label className="field">Code
                <input type="text" name="code" inputMode="numeric" autoComplete="one-time-code" required maxLength={6} />
              </label>
              <button className="btn primary" type="submit">Sign in</button>
              <a href="/login">Use a different number</a>
            </form>
          )}
        </div>
        {fake && (
          <p className="small muted">
            Test mode: no real texts are sent. Read your code in the <a href="/dev">text simulator</a>.
          </p>
        )}
      </div>
    </main>
  );
}
