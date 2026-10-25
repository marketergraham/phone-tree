import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export const dynamic = "force-dynamic";

export async function GET() {
  await getDb().execute(sql`select 1`);
  return Response.json({ ok: true });
}
