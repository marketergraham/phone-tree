"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireParent } from "@/lib/auth";
import { normalizePhone } from "@/lib/time";

export async function saveProvider(form: FormData) {
  await requireParent();
  const db = getDb();
  const id = Number(form.get("id") || 0);
  const phone = normalizePhone(String(form.get("phone") ?? ""));
  const back = id ? `/providers/${id}` : "/providers/new";
  if (!phone) redirect(`${back}?error=phone`);
  const name = String(form.get("name") ?? "").trim();
  if (!name) redirect(`${back}?error=name`);
  const rateRaw = String(form.get("rate") ?? "").replace(/[$\s]/g, "");
  let availability: string[] = [];
  try { availability = JSON.parse(String(form.get("availability") ?? "[]")); } catch { /* keep empty */ }
  const values = {
    name, phone,
    rateCents: rateRaw && Number.isFinite(Number(rateRaw)) ? Math.round(Number(rateRaw) * 100) : null,
    tier: Math.min(3, Math.max(1, Number(form.get("tier") || 1))),
    availability: availability.filter((k) => /^[1-7]:(early|morning|afternoon|evening|late)$/.test(k)),
    active: form.get("active") === "on",
    notes: String(form.get("notes") ?? "").trim() || null,
  };
  const markJoined = form.get("markJoined") === "on";
  try {
    if (id) {
      await db.update(schema.providers).set(values).where(eq(schema.providers.id, id));
      if (markJoined) await db.update(schema.providers).set({ joined: true, joinedAt: new Date() }).where(eq(schema.providers.id, id));
    } else {
      await db.insert(schema.providers).values({ ...values, joined: markJoined, joinedAt: markJoined ? new Date() : null });
    }
  } catch {
    redirect(`${back}?error=dup`);
  }
  revalidatePath("/providers");
  redirect("/providers?saved=1");
}

export async function addAway(providerId: number, form: FormData) {
  await requireParent();
  const start = String(form.get("start") ?? "");
  const end = String(form.get("end") ?? "") || start;
  if (/^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end)) {
    await getDb().insert(schema.awayDates).values({ providerId, startDate: start <= end ? start : end, endDate: start <= end ? end : start });
  }
  revalidatePath(`/providers/${providerId}`);
}

export async function removeAway(providerId: number, awayId: number) {
  await requireParent();
  await getDb().delete(schema.awayDates).where(eq(schema.awayDates.id, awayId));
  revalidatePath(`/providers/${providerId}`);
}

export async function deleteProvider(providerId: number) {
  await requireParent();
  await getDb().delete(schema.providers).where(eq(schema.providers.id, providerId));
  revalidatePath("/providers");
  redirect("/providers");
}
