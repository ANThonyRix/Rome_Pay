import { timingSafeEqual } from "node:crypto";
import { db, dbConfigured } from "@/lib/db";
import { deliverDue } from "@/lib/notify";
import { syncPaid } from "@/lib/store";

function sameSecret(given: string | null, secret: string): boolean {
  const a = Buffer.from(given ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Daily safety net (vercel.json cron): stores any Paid event the checkout did not report.
// Vercel sends `Authorization: Bearer <CRON_SECRET>` when the CRON_SECRET env var is set.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !sameSecret(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!dbConfigured()) return Response.json({ error: "DATABASE_URL is not set" }, { status: 503 });
  // A day is about 360k blocks; 4 spans of 400k cover a missed day with room to spare.
  // Housekeeping: expired nonces, old rate-limit windows.
  const sql = db();
  await sql.transaction([
    sql`delete from auth_nonces where expires_at < now()`,
    sql`delete from rate_limits where window_start < now() - interval '1 day'`,
  ]);
  const result = await syncPaid({ maxSpans: 4 });
  // Also retries notifications that failed earlier (their backoff is long past by the next day).
  const notifications = await deliverDue(100);
  return Response.json({
    notifications,
    head: result.head.toString(),
    cursor: result.cursor.toString(),
    stored: result.stored,
    caughtUp: result.caughtUp,
  });
}
