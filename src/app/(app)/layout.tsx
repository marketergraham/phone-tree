import Link from "next/link";
import { requireParent } from "@/lib/auth";
import { smsDriver } from "@/lib/sms";
import { loadCtx } from "@/lib/engine/context";
import { fmtStamp } from "@/lib/time";
import { Logo } from "./logo";
import { NavLinks } from "./nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireParent();
  const fake = smsDriver() === "fake";
  const ctx = fake ? await loadCtx() : null;
  return (
    <>
      {fake && ctx && (
        <div className="testbar">
          <strong>Test mode</strong>
          <span>No real texts are sent.</span>
          {ctx.hh.testClockOffsetMs !== 0 && <span>Clock: {fmtStamp(ctx.now, ctx.hh.timezone)}</span>}
          <Link href="/dev">Open text simulator</Link>
        </div>
      )}
      <header className="topbar">
        <Link href="/jobs" className="brand"><Logo /><span>Phone Tree</span></Link>
        <NavLinks />
      </header>
      {children}
    </>
  );
}
