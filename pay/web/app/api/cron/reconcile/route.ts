import { dbConfigured } from "@/lib/db";
import { syncPaid } from "@/lib/store";

// Daily safety net (vercel.json cron): stores any Paid event the checkout did not report.
// Vercel sends `Authorization: Bearer <CRON_SECRET>` when the CRON_SECRET env var is set.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!dbConfigured()) return Response.json({ error: "DATABASE_URL is not set" }, { status: 503 });
  // A day is about 360k blocks; 4 spans of 400k cover a missed day with room to spare.
  const result = await syncPaid({ maxSpans: 4 });
  return Response.json({
    head: result.head.toString(),
    cursor: result.cursor.toString(),
    stored: result.stored,
    caughtUp: result.caughtUp,
  });
}
