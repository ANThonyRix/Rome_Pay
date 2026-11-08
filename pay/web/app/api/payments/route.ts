import { after } from "next/server";
import { isHash } from "viem";
import { dbConfigured } from "@/lib/db";
import { deliverDue } from "@/lib/notify";
import { verifyPaymentTx } from "@/lib/store";

// The checkout reports a pay transaction here. Nothing from the client is trusted:
// the server reads the receipt from Rome and stores the router's Paid events it contains.
export async function POST(request: Request) {
  if (!dbConfigured()) return Response.json({ status: "unconfigured" }, { status: 503 });
  const body = (await request.json().catch(() => null)) as { txHash?: unknown } | null;
  const txHash = body?.txHash;
  if (typeof txHash !== "string" || !isHash(txHash)) {
    return Response.json({ error: "Send txHash, a 32-byte transaction hash." }, { status: 400 });
  }
  try {
    const result = await verifyPaymentTx(txHash);
    // Webhooks and Telegram messages go out after the checkout has its answer.
    if (result.status === "confirmed" && result.stored > 0) after(() => deliverDue());
    return Response.json(result, { status: result.status === "pending" ? 202 : 200 });
  } catch (error) {
    console.error("[rome-pay] verify failed", error);
    return Response.json({ error: "Could not verify the payment yet." }, { status: 502 });
  }
}
