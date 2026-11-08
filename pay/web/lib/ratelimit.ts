import "server-only";
import { db } from "./db";

// Fixed-window counters in Postgres. Serverless instances share no memory, so the count lives in the
// database. Good enough to stop floods of cheap requests; not a precise quota.

/** Best-effort client address behind Vercel's proxy. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return headers.get("x-real-ip")?.trim() || forwarded || "unknown";
}

/**
 * Counts one hit for `key` and says whether the caller is still under `limit` for the current window.
 * Fails open when the database errors, so an outage does not lock every merchant out.
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
  try {
    const [row] = await db()`
      insert into rate_limits (key, window_start, hits)
      values (${key}, to_timestamp(floor(extract(epoch from now()) / ${windowSec}) * ${windowSec}), 1)
      on conflict (key, window_start) do update set hits = rate_limits.hits + 1
      returning hits`;
    return Number(row?.hits ?? 1) <= limit;
  } catch (error) {
    console.error("[rome-pay] rate limit check failed", error);
    return true;
  }
}

export const tooMany = () =>
  Response.json({ error: "Too many requests. Wait a minute and try again." }, { status: 429, headers: { "retry-after": "60" } });
