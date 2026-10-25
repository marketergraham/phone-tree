import { asc } from "drizzle-orm";
import { schema } from "@/db";
import type { Ctx, Job } from "@/lib/engine/context";
import { local, money } from "@/lib/time";

export async function formProviders(ctx: Ctx) {
  const list = await ctx.db.select().from(schema.providers).orderBy(asc(schema.providers.tier), asc(schema.providers.name));
  return list.filter((p) => p.active).map((p) => ({
    name: p.name, tier: p.tier, availability: p.availability, rate: money(p.rateCents), ready: p.joined && !p.optedOut,
  }));
}

export function formDefaults(ctx: Ctx, job?: Job) {
  const tz = ctx.hh.timezone;
  if (job) {
    return {
      jobId: job.id,
      date: local(job.startsAt, tz).toISODate()!,
      start: local(job.startsAt, tz).toFormat("HH:mm"),
      end: local(job.endsAt, tz).toFormat("HH:mm"),
      rate: job.rateCents != null ? String(job.rateCents / 100) : "",
      kids: job.kids ?? "", note: job.note ?? "",
      wait2: job.tierWaits[0] ?? 24, wait3: job.tierWaits[1] ?? 24,
      unavailableMode: job.unavailableMode, unavailableWait: job.unavailableWaitHours,
      remindEvery: job.remindEveryHours, remindMax: job.remindMax, allowAnyHour: job.allowAnyHour, closeBefore: job.closeBeforeHours,
    };
  }
  const next = local(ctx.now, tz).plus({ days: 1 });
  return {
    date: next.toISODate()!, start: "18:00", end: "22:00", rate: "", kids: "", note: "",
    wait2: 24, wait3: 24, unavailableMode: "end", unavailableWait: 12, remindEvery: 12, remindMax: 3, allowAnyHour: false, closeBefore: 6,
  };
}
