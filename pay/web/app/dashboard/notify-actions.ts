"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { currentMerchant } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import {
  WebhookUrlError,
  checkWebhookUrl,
  createTelegramCode,
  disconnectTelegram,
  ensureTelegramWebhook,
  rotateWebhookSecret,
  sendTest,
  setWebhook,
  telegramBotUsername,
  telegramConfigured,
} from "@/lib/notify";

export type NotifyState = { error?: string; ok?: string; link?: string };

const SIGNED_OUT = { error: "Your session ended. Sign in again." };

export async function saveWebhookAction(_prev: NotifyState, form: FormData): Promise<NotifyState> {
  const merchant = await currentMerchant();
  if (!merchant) return SIGNED_OUT;
  const input = String(form.get("url") ?? "").trim();
  if (!input || form.get("remove") === "1") {
    await setWebhook(merchant.address, null);
    revalidatePath("/dashboard");
    return { ok: "Webhook removed. Payments are no longer sent to it." };
  }
  try {
    await setWebhook(merchant.address, checkWebhookUrl(input));
  } catch (error) {
    if (error instanceof WebhookUrlError) return { error: error.message };
    throw error;
  }
  revalidatePath("/dashboard");
  return { ok: "Saved. Every new payment is sent to this address." };
}

export async function rotateSecretAction(): Promise<NotifyState> {
  const merchant = await currentMerchant();
  if (!merchant) return SIGNED_OUT;
  await rotateWebhookSecret(merchant.address);
  revalidatePath("/dashboard");
  return { ok: "New secret made. Update it on your server; the old one no longer verifies." };
}

export async function sendTestAction(_prev: NotifyState, form: FormData): Promise<NotifyState> {
  const merchant = await currentMerchant();
  if (!merchant) return SIGNED_OUT;
  if (!(await rateLimit(`send-test:${merchant.address}`, 10, 60))) return { error: "Too many test events. Wait a minute." };
  const channel = form.get("channel") === "telegram" ? "telegram" : "webhook";
  const result = await sendTest(merchant.address, channel);
  if (result.ok) return { ok: channel === "webhook" ? `Test event delivered (HTTP ${result.status}).` : "Test message sent. Check Telegram." };
  return { error: `Test not delivered: ${result.error ?? "no answer"}.` };
}

export async function connectTelegramAction(): Promise<NotifyState> {
  const merchant = await currentMerchant();
  if (!merchant) return SIGNED_OUT;
  if (!telegramConfigured()) return { error: "Telegram is not set up on this deployment." };
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const [hooked, username] = await Promise.all([ensureTelegramWebhook(`${proto}://${host}`), telegramBotUsername()]);
  if (!hooked || !username) return { error: "Telegram did not answer. Try again in a minute." };
  const code = await createTelegramCode(merchant.address);
  return { link: `https://t.me/${username}?start=${code}` };
}

export async function disconnectTelegramAction(): Promise<void> {
  const merchant = await currentMerchant();
  if (!merchant) return;
  await disconnectTelegram(merchant.address);
  revalidatePath("/dashboard");
}
