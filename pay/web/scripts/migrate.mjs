// Applies db/schema.sql to the database in DATABASE_URL.
// Run: npm run db:migrate (reads .env.local). Never prints the connection string.
import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Run `npx vercel env pull .env.local` in pay/web first.");
  process.exit(1);
}

const sql = neon(url);
const schema = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
// Split on statement ends; the schema has no semicolons inside strings or bodies.
const statements = schema
  .split(/;\s*$/m)
  .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
  .filter(Boolean);

for (const statement of statements) await sql.query(statement);
const tables = await sql.query(
  "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
);
console.log(`Applied ${statements.length} statements. Tables: ${tables.map((t) => t.table_name).join(", ")}`);
