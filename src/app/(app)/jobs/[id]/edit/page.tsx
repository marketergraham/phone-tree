import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { loadCtx } from "@/lib/engine/context";
import { JobForm } from "../../job-form";
import { formDefaults, formProviders } from "../../form-data";
import { deleteDraftAction } from "../../actions";

export default async function EditDraft({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const ctx = await loadCtx();
  const [job] = await ctx.db.select().from(schema.jobs).where(eq(schema.jobs.id, Number(id)));
  if (!job) notFound();
  if (job.status !== "draft") redirect(`/jobs/${job.id}`);
  return (
    <main className="page stack">
      <div className="row between">
        <div>
          <Link href="/jobs" className="back">← All jobs</Link>
          <h1>Draft job</h1>
        </div>
        <form action={deleteDraftAction.bind(null, job.id)}><button className="btn danger" type="submit">Delete draft</button></form>
      </div>
      <JobForm providers={await formProviders(ctx)} tz={ctx.hh.timezone} startMin={ctx.hh.textingStartMin} endMin={ctx.hh.textingEndMin}
        nowIso={ctx.now.toISOString()} d={formDefaults(ctx, job)} error={error} />
    </main>
  );
}
