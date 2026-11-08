import { dbConfigured } from "@/lib/db";
import { issueNonce } from "@/lib/auth";
import { clientIp, rateLimit, tooMany } from "@/lib/ratelimit";

export async function POST(request: Request) {
  if (!dbConfigured()) return Response.json({ error: "Sign-in is not configured on this deployment." }, { status: 503 });
  if (!(await rateLimit(`nonce:${clientIp(request.headers)}`, 20, 60))) return tooMany();
  return Response.json({ nonce: await issueNonce() });
}
