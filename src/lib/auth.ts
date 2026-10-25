import { createHash, randomBytes, randomInt } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { normalizePhone } from "@/lib/time";
import { loadCtx, text } from "@/lib/engine/context";

const COOKIE = "pt_session";
const hash = (s: string) => createHash("sha256").update(`${process.env.SESSION_SECRET ?? ""}:${s}`).digest("hex");

/**
 * Parents come from PARENT_PHONES, e.g. "Graham:+15105550100,Susanna:+15105550101".
 * Only these numbers can sign in.
 */
export async function ensureParents() {
  const db = getDb();
  const spec = process.env.PARENT_PHONES ?? "";
  for (const part of spec.split(",").map((s) => s.trim()).filter(Boolean)) {
    const [name, raw] = part.includes(":") ? part.split(":") : ["Parent", part];
    const phone = normalizePhone(raw);
    if (!phone) continue;
    await db.insert(schema.parents).values({ name: name.trim(), phone }).onConflictDoNothing();
  }
}

export async function requestCode(rawPhone: string): Promise<{ ok: boolean; phone?: string }> {
  await ensureParents();
  const db = getDb();
  const phone = normalizePhone(rawPhone);
  if (!phone) return { ok: false };
  const [parent] = await db.select().from(schema.parents).where(eq(schema.parents.phone, phone));
  // Same answer either way, so the page doesn't reveal which numbers are parents.
  if (!parent) return { ok: true, phone };
  const code = String(randomInt(100000, 1000000));
  const ctx = await loadCtx(db);
  await db.insert(schema.loginCodes).values({ phone, codeHash: hash(code), expiresAt: new Date(Date.now() + 10 * 60_000) });
  await text(ctx, phone, `Your Phone Tree sign-in code is ${code}. It expires in 10 minutes.`);
  return { ok: true, phone };
}

export async function verifyCode(phone: string, code: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db.select().from(schema.loginCodes)
    .where(and(eq(schema.loginCodes.phone, phone), eq(schema.loginCodes.used, false), gt(schema.loginCodes.expiresAt, new Date())))
    .orderBy(schema.loginCodes.id).limit(1);
  if (!row || row.attempts >= 5) return false;
  if (row.codeHash !== hash(code.trim())) {
    await db.update(schema.loginCodes).set({ attempts: row.attempts + 1 }).where(eq(schema.loginCodes.id, row.id));
    return false;
  }
  await db.update(schema.loginCodes).set({ used: true }).where(eq(schema.loginCodes.phone, phone));
  const [parent] = await db.select().from(schema.parents).where(eq(schema.parents.phone, phone));
  if (!parent) return false;
  const id = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 90 * 24 * 3600_000);
  await db.insert(schema.sessions).values({ id: hash(id), parentId: parent.id, expiresAt });
  (await cookies()).set(COOKIE, id, {
    httpOnly: true, sameSite: "lax", secure: process.env.PUBLIC_URL?.startsWith("https://") ?? false, expires: expiresAt, path: "/",
  });
  return true;
}

export async function currentParent() {
  const id = (await cookies()).get(COOKIE)?.value;
  if (!id) return null;
  const db = getDb();
  const [row] = await db.select({ parent: schema.parents }).from(schema.sessions)
    .innerJoin(schema.parents, eq(schema.sessions.parentId, schema.parents.id))
    .where(and(eq(schema.sessions.id, hash(id)), gt(schema.sessions.expiresAt, new Date())));
  return row?.parent ?? null;
}

export async function requireParent() {
  const p = await currentParent();
  if (!p) redirect("/login");
  return p;
}

export async function signOut() {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (id) await getDb().delete(schema.sessions).where(eq(schema.sessions.id, hash(id)));
  jar.delete(COOKIE);
}
