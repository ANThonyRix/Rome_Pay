import { isHex } from "viem";
import { SignInError, signIn } from "@/lib/auth";
import { dbConfigured } from "@/lib/db";

export async function POST(request: Request) {
  if (!dbConfigured()) return Response.json({ error: "Sign-in is not configured on this deployment." }, { status: 503 });
  const body = (await request.json().catch(() => null)) as { message?: unknown; signature?: unknown } | null;
  const message = typeof body?.message === "string" ? body.message : "";
  const signature = body?.signature;
  if (!message || message.length > 2000 || !isHex(signature)) {
    return Response.json({ error: "Send the signed message and its signature." }, { status: 400 });
  }
  const host = request.headers.get("host") ?? "";
  try {
    const address = await signIn(message, signature, host);
    return Response.json({ address });
  } catch (error) {
    if (error instanceof SignInError) return Response.json({ error: error.message }, { status: 401 });
    console.error("[rome-pay] sign-in failed", error);
    return Response.json({ error: "Sign-in failed. Try again." }, { status: 500 });
  }
}
