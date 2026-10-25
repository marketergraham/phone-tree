// Applies SQL migrations in ./drizzle. Runs before the app starts on Render.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const pool = new pg.Pool({
  connectionString: url,
  ssl: /sslmode=require|render\.com/.test(url) ? { rejectUnauthorized: false } : undefined,
});
await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
await pool.end();
console.log("Migrations applied");
