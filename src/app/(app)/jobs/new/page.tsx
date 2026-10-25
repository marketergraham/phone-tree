import Link from "next/link";
import { loadCtx } from "@/lib/engine/context";
import { JobForm } from "../job-form";
import { formDefaults, formProviders } from "../form-data";

export default async function NewJob({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const ctx = await loadCtx();
  const { error } = await searchParams;
  const providers = await formProviders(ctx);
  return (
    <main className="page stack">
      <div>
        <Link href="/jobs" className="back">← All jobs</Link>
        <h1>New job</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>Fill in the when, choose who hears about it, and set how it rolls out. Nothing is sent until you press Send.</p>
      </div>
      {providers.length === 0 && (
        <p className="err">You don&apos;t have any sitters yet. <Link href="/providers/new">Add one first</Link>.</p>
      )}
      <JobForm providers={providers} tz={ctx.hh.timezone} startMin={ctx.hh.textingStartMin} endMin={ctx.hh.textingEndMin}
        nowIso={ctx.now.toISOString()} d={formDefaults(ctx)} error={error} />
    </main>
  );
}
