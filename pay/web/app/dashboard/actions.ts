"use server";

import { revalidatePath } from "next/cache";
import { currentMerchant, signOut } from "@/lib/auth";
import { parseUsdc } from "@/lib/invoices";
import { createLink, deleteUnpaidLink, setLinkArchived, setMerchantName } from "@/lib/store";

export type FormState = { error?: string; ok?: string; linkId?: string };

const MEMO_MAX = 140;
const NAME_MAX = 60;

export async function createLinkAction(_prev: FormState, form: FormData): Promise<FormState> {
  const merchant = await currentMerchant();
  if (!merchant) return { error: "Your session ended. Sign in again." };

  const open = form.get("mode") === "open";
  const memo = String(form.get("memo") ?? "").trim();
  if (!memo) return { error: "Say what the payment is for. The payer sees it on the checkout." };
  if (memo.length > MEMO_MAX) return { error: `Keep the description under ${MEMO_MAX} characters.` };

  let amount: bigint | null = null;
  if (!open) {
    amount = parseUsdc(String(form.get("amount") ?? ""));
    if (amount === null) return { error: "Enter an amount above 0 and up to 1,000,000 USDC, with at most 6 decimals." };
  }
  // Open-amount links are for tips and donations, so they always accept repeat payments.
  const reusable = open || form.get("uses") === "many";

  const linkId = await createLink(merchant.address, { amount, memo, reusable });
  revalidatePath("/dashboard");
  return { ok: "Link created.", linkId };
}

export async function saveNameAction(_prev: FormState, form: FormData): Promise<FormState> {
  const merchant = await currentMerchant();
  if (!merchant) return { error: "Your session ended. Sign in again." };
  const name = String(form.get("name") ?? "").replace(/\s+/g, " ").trim();
  if (!name) return { error: "Enter the name payers should see." };
  if (name.length > NAME_MAX) return { error: `Keep the name under ${NAME_MAX} characters.` };
  await setMerchantName(merchant.address, name);
  revalidatePath("/dashboard");
  return { ok: "Saved." };
}

export async function setArchivedAction(form: FormData): Promise<void> {
  const merchant = await currentMerchant();
  if (!merchant) return;
  const id = String(form.get("id") ?? "");
  await setLinkArchived(merchant.address, id, form.get("archived") === "1");
  revalidatePath("/dashboard");
}

export async function deleteLinkAction(form: FormData): Promise<void> {
  const merchant = await currentMerchant();
  if (!merchant) return;
  await deleteUnpaidLink(merchant.address, String(form.get("id") ?? ""));
  revalidatePath("/dashboard");
}

export async function signOutAction(): Promise<void> {
  await signOut();
  revalidatePath("/dashboard");
}
