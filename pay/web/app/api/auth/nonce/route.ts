import { dbConfigured } from "@/lib/db";
import { issueNonce } from "@/lib/auth";

export async function POST() {
  if (!dbConfigured()) return Response.json({ error: "Sign-in is not configured on this deployment." }, { status: 503 });
  return Response.json({ nonce: await issueNonce() });
}
