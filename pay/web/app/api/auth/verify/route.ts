import { isHex } from "viem";
import { SignInError, signIn, signInSolana } from "@/lib/auth";
import { dbConfigured } from "@/lib/db";
import { clientIp, rateLimit, tooMany } from "@/lib/ratelimit";

// Two payloads: { message, signature: 0x hex } from MetaMask (SIWE), or
// { kind: "solana", message, signature: base58 } from a Solana wallet's solana:signMessage.
export async function POST(request: Request) {
  if (!dbConfigured()) return Response.json({ error: "Sign-in is not configured on this deployment." }, { status: 503 });
  if (!(await rateLimit(`verify:${clientIp(request.headers)}`, 20, 60))) return tooMany();
  const body = (await request.json().catch(() => null)) as { kind?: unknown; message?: unknown; signature?: unknown } | null;
  const message = typeof body?.message === "string" ? body.message : "";
  const signature = body?.signature;
  const solana = body?.kind === "solana";
  const signatureOk = solana ? typeof signature === "string" && /^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(signature) : isHex(signature);
  if (!message || message.length > 2000 || !signatureOk) {
    return Response.json({ error: "Send the signed message and its signature." }, { status: 400 });
  }
  const host = request.headers.get("host") ?? "";
  try {
    const address = solana ? await signInSolana(message, signature as string, host) : await signIn(message, signature as `0x${string}`, host);
    return Response.json({ address });
  } catch (error) {
    if (error instanceof SignInError) return Response.json({ error: error.message }, { status: 401 });
    console.error("[rome-pay] sign-in failed", error);
    return Response.json({ error: "Sign-in failed. Try again." }, { status: 500 });
  }
}
