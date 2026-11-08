import { timingSafeEqual } from "node:crypto";
import { dbConfigured } from "@/lib/db";
import { short } from "@/lib/format";
import { claimTelegramCode, disconnectChat, telegram, telegramWebhookSecret } from "@/lib/notify";

// Telegram bot updates (setWebhook points here, see ensureTelegramWebhook). The secret header proves
// the request comes from Telegram. Handles `/start <code>` from the dashboard deep link and `/stop`.
// Always answers 200 once the secret matches, so Telegram does not retry a message we chose to ignore.

interface Update {
  message?: { chat?: { id?: number }; text?: string };
}

const sameSecret = (given: string | null, expected: string) =>
  given !== null && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));

const reply = (chatId: number, text: string) =>
  telegram("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", link_preview_options: { is_disabled: true } });

export async function POST(request: Request) {
  const secret = telegramWebhookSecret();
  if (!secret || !sameSecret(request.headers.get("x-telegram-bot-api-secret-token"), secret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const update = (await request.json().catch(() => null)) as Update | null;
  const chatId = update?.message?.chat?.id;
  const text = update?.message?.text?.trim() ?? "";
  if (typeof chatId !== "number" || !text || !dbConfigured()) return Response.json({ ok: true });

  const [command, arg] = text.split(/\s+/, 2);
  const name = command.replace(/@\w+$/, "").toLowerCase();

  if (name === "/start" && arg && /^[A-Za-z0-9_-]{1,64}$/.test(arg)) {
    const merchant = await claimTelegramCode(arg, chatId);
    await reply(
      chatId,
      merchant
        ? `Connected to Rome Pay. You will get a message here for every payment to <b>${(merchant.name || short(merchant.address)).replace(/[<>&]/g, "")}</b>.\n\nSend /stop to turn these messages off.`
        : "This connect link has expired or was already used. Open your Rome Pay dashboard and press Connect Telegram again.",
    );
  } else if (name === "/stop") {
    const count = await disconnectChat(chatId);
    await reply(chatId, count ? "Done. This chat no longer gets payment messages." : "This chat is not connected to Rome Pay.");
  } else {
    await reply(chatId, "This bot sends Rome Pay payment messages. To connect, open your Rome Pay dashboard and press Connect Telegram.");
  }
  return Response.json({ ok: true });
}
