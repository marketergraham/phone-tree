import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;

const g = globalThis as unknown as { __ptPool?: Pool; __ptDb?: DB };

export function getDb(): DB {
  if (!g.__ptDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    g.__ptPool = new Pool({
      connectionString: url,
      ssl: /sslmode=require|render\.com/.test(url) ? { rejectUnauthorized: false } : undefined,
      max: 5,
    });
    g.__ptDb = drizzle(g.__ptPool, { schema });
  }
  return g.__ptDb;
}

export async function closeDb() {
  await g.__ptPool?.end();
  g.__ptPool = undefined;
  g.__ptDb = undefined;
}

export { schema };
