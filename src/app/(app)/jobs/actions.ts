"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { getDb, schema } from "@/db";
import { requireParent } from "@/lib/auth";
import { loadCtx } from "@/lib/engine/context";
import { serial } from "@/lib/engine/scheduler";
import {
  askUnavailableNow, cancelJob, getJob, nudge, parentMarksDropped, reopenClosed, sendJob, setPaused, textEveryoneNow,
} from "@/lib/engine/rollout";
import type { UnavailableMode } from "@/db/schema";

const num = (v: FormDataEntryValue | null, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && String(v ?? "").trim() !== "" ? n : d;
};

export async function saveJob(form: FormData) {
  await requireParent();
  const ctx = await loadCtx();
  const tz = ctx.hh.timezone;
  const date = String(form.get("date"));
  const start = DateTime.fromISO(`${date}T${form.get("start")}`, { zone: tz });
  let end = DateTime.fromISO(`${date}T${form.get("end")}`, { zone: tz });
  if (!start.isValid || !end.isValid) redirect("/jobs/new?error=time");
  if (end <= start) end = end.plus({ days: 1 }); // ends after midnight
  const rateRaw = String(form.get("rate") ?? "").replace(/[$\s]/g, "");
  const values = {
    startsAt: start.toJSDate(),
    endsAt: end.toJSDate(),
    rateCents: rateRaw ? Math.round(Number(rateRaw) * 100) : null,
    kids: String(form.get("kids") ?? "").trim() || null,
    note: String(form.get("note") ?? "").trim() || null,
    tierWaits: [num(form.get("wait2"), 24), num(form.get("wait3"), 24)],
    unavailableMode: (String(form.get("unavailableMode")) || "end") as UnavailableMode,
    unavailableWaitHours: num(form.get("unavailableWait"), 12),
    remindEveryHours: num(form.get("remindEvery"), 12),
    remindMax: num(form.get("remindMax"), 3),
    allowAnyHour: form.get("allowAnyHour") === "on",
    closeBeforeHours: num(form.get("closeBefore"), 6),
  };
  if (values.rateCents != null && !Number.isFinite(values.rateCents)) values.rateCents = null;
  const id = Number(form.get("jobId") || 0);
  let jobId = id;
  if (id) {
    const job = await getJob(ctx, id);
    if (job.status !== "draft") redirect(`/jobs/${id}`);
    await ctx.db.update(schema.jobs).set(values).where(eq(schema.jobs.id, id));
  } else {
    const [j] = await ctx.db.insert(schema.jobs).values(values).returning();
    jobId = j.id;
  }
  if (form.get("intent") === "send") {
    if (values.startsAt <= ctx.now) redirect(`/jobs/${jobId}/edit?error=past`);
    await serial(async () => sendJob(await loadCtx(), jobId));
  }
  revalidatePath("/jobs");
  redirect(form.get("intent") === "send" ? `/jobs/${jobId}` : "/jobs");
}

async function act(jobId: number, fn: (ctx: Awaited<ReturnType<typeof loadCtx>>) => Promise<unknown>) {
  await requireParent();
  await serial(async () => fn(await loadCtx()));
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");
}

export async function pauseAction(jobId: number, paused: boolean) { await act(jobId, (c) => setPaused(c, jobId, paused)); }
export async function textEveryoneAction(jobId: number) { await act(jobId, (c) => textEveryoneNow(c, jobId)); }
export async function askUnavailableAction(jobId: number) { await act(jobId, (c) => askUnavailableNow(c, jobId)); }
export async function cancelJobAction(jobId: number) { await act(jobId, (c) => cancelJob(c, jobId)); }
export async function sitterCanceledAction(jobId: number) { await act(jobId, (c) => parentMarksDropped(c, jobId)); }
export async function nudgeAction(jobId: number, offerId: number) { await act(jobId, (c) => nudge(c, jobId, offerId)); }
export async function reopenAction(jobId: number) { await act(jobId, (c) => reopenClosed(c, jobId)); }
export async function deleteDraftAction(jobId: number) {
  await requireParent();
  const db = getDb();
  const [j] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
  if (j?.status === "draft") await db.delete(schema.jobs).where(eq(schema.jobs.id, jobId));
  redirect("/jobs");
}
