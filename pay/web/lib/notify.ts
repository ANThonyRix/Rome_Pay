import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { getAddress, type Hex } from "viem";
import { CHAIN, txUrl } from "./chain";
import { db } from "./db";
import { fmt, short } from "./format";

// Payment notifications: signed webhooks and Telegram messages, fed by the `notifications` outbox.
// Rows are queued when a payment is first stored (store.ts) and delivered by deliverDue(), which
// runs after checkout reports, dashboard renders and the daily cron. Failed sends back off and retry.

const MAX_ATTEMPTS = 6;
const BACKOFF_S = [60, 5 * 60, 30 * 60, 2 * 3600, 12 * 3600];
const SEND_TIMEOUT_MS = 8_000;
const usdc = (units: bigint) => fmt(units, 6);

// --------------------------------------------------------------- the event

export interface PaymentEvent {
  id: string;
  type: "payment.received" | "test";
  created: number;
  network: { chainId: number; name: string; testnet: boolean };
  data: {
    link: { id: string; memo: string; amount: string | null } | null;
    merchant: Hex;
    payer: Hex;
    token: "wUSDC";
    decimals: 6;
    amount: string; // gross, base units
    fee: string;
    net: string; // what the merchant received
    txHash: Hex;
    blockNumber: string;
    paidAt: string | null;
    receiptUrl: string;
  };
}

const network = { chainId: CHAIN.chainId, name: CHAIN.name, testnet: CHAIN.testnet };

interface PaymentRow {
  tx_hash: string;
  log_index: number;
  block_number: string;
  block_time: string | null;
  invoice_id: string | null;
  memo: string | null;
  link_amount: string | null;
  merchant: string;
  payer: string;
  amount: string;
  fee: string;
}

function eventFor(p: PaymentRow): PaymentEvent {
  const amount = BigInt(p.amount);
  const fee = BigInt(p.fee);
  return {
    id: `evt_${p.tx_hash.slice(2)}_${p.log_index}`,
    type: "payment.received",
    created: Math.floor(Date.now() / 1000),
    network,
    data: {
      link: p.invoice_id ? { id: p.invoice_id, memo: p.memo ?? "", amount: p.link_amount } : null,
      merchant: getAddress(p.merchant),
      payer: getAddress(p.payer),
      token: "wUSDC",
      decimals: 6,
      amount: amount.toString(),
      fee: fee.toString(),
      net: (amount - fee).toString(),
      txHash: p.tx_hash as Hex,
      blockNumber: p.block_number,
      paidAt: p.block_time ? new Date(p.block_time).toISOString() : null,
      receiptUrl: txUrl(p.tx_hash),
    },
  };
}

function testEvent(merchant: Hex): PaymentEvent {
  const hash = `0x${"0".repeat(64)}` as Hex;
  return {
    id: `evt_test_${randomBytes(6).toString("hex")}`,
    type: "test",
    created: Math.floor(Date.now() / 1000),
    network,
    data: {
      link: { id: "test", memo: "Test event from your Rome Pay dashboard", amount: "1000000" },
      merchant,
      payer: merchant,
      token: "wUSDC",
      decimals: 6,
      amount: "1000000",
      fee: "10000",
      net: "990000",
      txHash: hash,
      blockNumber: "0",
      paidAt: new Date().toISOString(),
      receiptUrl: txUrl(hash),
    },
  };
}

// ---------------------------------------------------------------- webhooks

export const newWebhookSecret = () => `whsec_${randomBytes(24).toString("base64url")}`;

/** `t=<unix>,v1=<hex>`: HMAC-SHA256 over "<t>.<raw body>" with the merchant's secret. */
export function signatureHeader(secret: string, body: string, t = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

/** Only allowed outside production, so a developer can point a webhook at localhost. */
const allowPrivate = () => process.env.NODE_ENV !== "production" && process.env.WEBHOOK_ALLOW_PRIVATE === "1";

function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === "::" || v === "::1") return true;
    if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
    return /^(fc|fd|fe8|fe9|fea|feb)/.test(v);
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224
  );
}

export class WebhookUrlError extends Error {}

/** Normalizes a merchant's webhook URL, or throws a message the merchant can act on. */
export function checkWebhookUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new WebhookUrlError("Enter a full address, like https://example.com/rome-pay.");
  }
  const local = allowPrivate() && url.protocol === "http:";
  if (url.protocol !== "https:" && !local) throw new WebhookUrlError("The address must start with https://.");
  if (url.username || url.password) throw new WebhookUrlError("Leave the login out of the address.");
  if (url.port && url.port !== "443" && !allowPrivate()) throw new WebhookUrlError("Use the standard HTTPS port (443).");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!allowPrivate() && (host === "localhost" || /\.(local|internal|localhost)$/.test(host) || (isIP(host) && isPrivateIp(host)))) {
    throw new WebhookUrlError("That address is not reachable from the internet.");
  }
  if (url.href.length > 500) throw new WebhookUrlError("The address is too long.");
  url.hash = "";
  return url.href;
}

/** Resolves the host right before sending, so a public name that points inside a network is refused. */
async function assertPublicHost(url: URL): Promise<void> {
  if (allowPrivate()) return;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addresses.length || addresses.some((a) => isPrivateIp(a.address))) throw new Error("host resolves to a private address");
}

interface SendResult {
  ok: boolean;
  status: number | null;
  error: string | null;
}

async function postWebhook(urlText: string, secret: string, event: PaymentEvent): Promise<SendResult> {
  const body = JSON.stringify(event);
  try {
    const url = new URL(urlText);
    await assertPublicHost(url);
    const res = await fetch(url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      headers: {
        "content-type": "application/json",
        "user-agent": "RomePay-Webhooks/1.0",
        "rome-pay-event-id": event.id,
        "rome-pay-signature": signatureHeader(secret, body),
      },
      body,
    });
    await res.body?.cancel().catch(() => undefined);
    const ok = res.status >= 200 && res.status < 300;
    return { ok, status: res.status, error: ok ? null : `HTTP ${res.status}` };
  } catch (error) {
    const reason = error instanceof Error ? (error.name === "TimeoutError" ? `no answer in ${SEND_TIMEOUT_MS / 1000} s` : error.message) : String(error);
    return { ok: false, status: null, error: reason.slice(0, 200) };
  }
}

// ---------------------------------------------------------------- Telegram

const botToken = () => process.env.TELEGRAM_BOT_TOKEN || null;
export const telegramConfigured = () => Boolean(botToken());

/** Secret Telegram echoes in X-Telegram-Bot-Api-Secret-Token; derived from the bot token, so no extra env var. */
export const telegramWebhookSecret = (): string | null => {
  const token = botToken();
  return token ? createHash("sha256").update(`rome-pay-webhook:${token}`).digest("hex") : null;
};

interface TelegramReply<T> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
}

export async function telegram<T = unknown>(method: string, params: Record<string, unknown>): Promise<TelegramReply<T>> {
  const token = botToken();
  if (!token) return { ok: false, description: "TELEGRAM_BOT_TOKEN is not set" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    return (await res.json()) as TelegramReply<T>;
  } catch (error) {
    return { ok: false, description: error instanceof Error ? error.message : String(error) };
  }
}

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function telegramText(event: PaymentEvent): string {
  const { data } = event;
  const amount = BigInt(data.amount);
  const fee = BigInt(data.fee);
  const lines = [
    `${event.type === "test" ? "<b>Test.</b> " : ""}<b>+${usdc(amount - fee)} USDC</b> received`,
    data.link ? `For: ${escapeHtml(data.link.memo)}` : "Not from one of your links",
    `Paid ${usdc(amount)} USDC, fee ${usdc(fee)}`,
    `From <code>${short(data.payer)}</code>`,
    event.type === "test"
      ? `${CHAIN.name}${CHAIN.testnet ? " testnet" : ""}`
      : `<a href="${data.receiptUrl}">Receipt</a> · ${CHAIN.name}${CHAIN.testnet ? " testnet" : ""}`,
  ];
  return lines.join("\n");
}

async function sendTelegram(chatId: string, event: PaymentEvent): Promise<SendResult & { blocked: boolean }> {
  const reply = await telegram("sendMessage", {
    chat_id: chatId,
    text: telegramText(event),
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });
  const blocked = reply.error_code === 403 || (reply.error_code === 400 && /chat not found/i.test(reply.description ?? ""));
  return { ok: reply.ok, status: reply.error_code ?? (reply.ok ? 200 : null), error: reply.ok ? null : (reply.description ?? "Telegram did not accept the message").slice(0, 200), blocked };
}

// ---------------------------------------------------------------- delivery

/**
 * Claims due rows and sends them. A claim pushes next_attempt_at forward first, so two concurrent
 * runs never send the same row twice. Never throws.
 */
export async function deliverDue(limit = 20): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  try {
    const sql = db();
    const claimed = await sql`
      update notifications n set attempts = n.attempts + 1, next_attempt_at = now() + interval '2 minutes'
      where n.id in (
        select id from notifications where status = 'pending' and next_attempt_at <= now()
        order by id limit ${limit})
        and n.status = 'pending' and n.next_attempt_at <= now()
      returning n.id, n.channel, n.attempts, n.tx_hash, n.log_index`;
    for (const row of claimed) {
      const [p] = await sql`
        select p.tx_hash, p.log_index, p.block_number::text, p.block_time, p.invoice_id, p.merchant, p.payer,
          p.amount::text, p.fee::text, i.memo, i.amount::text as link_amount,
          m.webhook_url, m.webhook_secret, m.telegram_chat_id::text
        from payments p
        join merchants m on m.address = p.merchant
        left join invoices i on i.id = p.invoice_id
        where p.tx_hash = ${row.tx_hash} and p.log_index = ${row.log_index}`;
      let result: SendResult;
      if (!p) result = { ok: false, status: null, error: "payment not found" };
      else if (row.channel === "webhook") {
        result = p.webhook_url && p.webhook_secret
          ? await postWebhook(p.webhook_url as string, p.webhook_secret as string, eventFor(p as unknown as PaymentRow))
          : { ok: false, status: null, error: "webhook turned off" };
      } else {
        if (!p.telegram_chat_id) result = { ok: false, status: null, error: "Telegram disconnected" };
        else {
          const tg = await sendTelegram(p.telegram_chat_id as string, eventFor(p as unknown as PaymentRow));
          if (tg.blocked) await sql`update merchants set telegram_chat_id = null where address = ${p.merchant} and telegram_chat_id = ${p.telegram_chat_id}`;
          result = tg;
        }
      }

      const attempts = Number(row.attempts);
      const giveUp = !result.ok && (attempts >= MAX_ATTEMPTS || /turned off|disconnected|not found/.test(result.error ?? ""));
      const backoff = BACKOFF_S[Math.min(attempts - 1, BACKOFF_S.length - 1)];
      await sql`
        update notifications set
          status = ${result.ok ? "sent" : giveUp ? "failed" : "pending"},
          response_status = ${result.status},
          last_error = ${result.error},
          sent_at = ${result.ok ? new Date().toISOString() : null},
          next_attempt_at = now() + make_interval(secs => ${backoff}::double precision)
        where id = ${row.id}`;
      if (result.ok) sent++;
      else failed++;
    }
  } catch (error) {
    console.warn("[rome-pay] notification delivery failed", error instanceof Error ? error.message : error);
  }
  return { sent, failed };
}

/** Sends a test event to the merchant's webhook and/or Telegram chat right away; not queued. */
export async function sendTest(merchant: Hex, channel: "webhook" | "telegram"): Promise<SendResult> {
  const [m] = await db()`
    select webhook_url, webhook_secret, telegram_chat_id::text from merchants where address = ${merchant.toLowerCase()}`;
  if (!m) return { ok: false, status: null, error: "merchant not found" };
  const event = testEvent(merchant);
  if (channel === "webhook") {
    if (!m.webhook_url || !m.webhook_secret) return { ok: false, status: null, error: "Save a webhook address first." };
    return postWebhook(m.webhook_url as string, m.webhook_secret as string, event);
  }
  if (!m.telegram_chat_id) return { ok: false, status: null, error: "Connect Telegram first." };
  return sendTelegram(m.telegram_chat_id as string, event);
}

// ------------------------------------------------------------ dashboard view

export interface Delivery {
  id: string;
  channel: "webhook" | "telegram";
  status: "pending" | "sent" | "failed";
  attempts: number;
  responseStatus: number | null;
  lastError: string | null;
  createdAt: Date;
  amount: bigint;
  memo: string | null;
  txHash: Hex;
}

export async function listDeliveries(merchant: Hex, limit = 20): Promise<Delivery[]> {
  const rows = await db()`
    select n.id::text, n.channel, n.status, n.attempts, n.response_status, n.last_error, n.created_at,
      n.tx_hash, p.amount::text, i.memo
    from notifications n
    left join payments p on p.tx_hash = n.tx_hash and p.log_index = n.log_index
    left join invoices i on i.id = p.invoice_id
    where n.merchant = ${merchant.toLowerCase()}
    order by n.id desc limit ${limit}`;
  return rows.map((r) => ({
    id: r.id as string,
    channel: r.channel as Delivery["channel"],
    status: r.status as Delivery["status"],
    attempts: r.attempts as number,
    responseStatus: (r.response_status as number) ?? null,
    lastError: (r.last_error as string) ?? null,
    createdAt: new Date(r.created_at as string),
    amount: BigInt((r.amount as string) ?? "0"),
    memo: (r.memo as string) ?? null,
    txHash: r.tx_hash as Hex,
  }));
}

// ------------------------------------------------------------ merchant setup

/** Saves (or with null, removes) the webhook address. A secret is created the first time. */
export async function setWebhook(merchant: Hex, url: string | null): Promise<void> {
  await db()`
    update merchants set webhook_url = ${url},
      webhook_secret = case when ${url}::text is null then webhook_secret else coalesce(webhook_secret, ${newWebhookSecret()}) end
    where address = ${merchant.toLowerCase()}`;
}

export async function rotateWebhookSecret(merchant: Hex): Promise<void> {
  await db()`update merchants set webhook_secret = ${newWebhookSecret()} where address = ${merchant.toLowerCase()}`;
}

const TELEGRAM_CODE_TTL_MIN = 15;

/** A one-time code for t.me/<bot>?start=<code>; 16 random bytes, base64url fits Telegram's [A-Za-z0-9_-]{1,64}. */
export async function createTelegramCode(merchant: Hex): Promise<string> {
  const code = randomBytes(16).toString("base64url");
  await db()`
    update merchants set telegram_code = ${code},
      telegram_code_expires = now() + make_interval(mins => ${TELEGRAM_CODE_TTL_MIN})
    where address = ${merchant.toLowerCase()}`;
  return code;
}

/** Binds a chat to the merchant that issued the code. Returns the merchant, or null for a bad or stale code. */
export async function claimTelegramCode(code: string, chatId: number): Promise<{ address: Hex; name: string } | null> {
  const [row] = await db()`
    update merchants set telegram_chat_id = ${chatId}, telegram_code = null, telegram_code_expires = null
    where telegram_code = ${code} and telegram_code_expires > now()
    returning address, name`;
  return row ? { address: getAddress(row.address as string), name: row.name as string } : null;
}

export async function disconnectTelegram(merchant: Hex): Promise<void> {
  await db()`update merchants set telegram_chat_id = null, telegram_code = null where address = ${merchant.toLowerCase()}`;
}

export async function disconnectChat(chatId: number): Promise<number> {
  const rows = await db()`update merchants set telegram_chat_id = null where telegram_chat_id = ${chatId} returning address`;
  return rows.length;
}

let botUsername: string | null = null;

/** The bot's @username, read once from getMe. */
export async function telegramBotUsername(): Promise<string | null> {
  if (botUsername) return botUsername;
  const me = await telegram<{ username?: string }>("getMe", {});
  botUsername = me.ok ? (me.result?.username ?? null) : null;
  return botUsername;
}

/** Points the bot at /api/telegram on the production domain, once; later calls only read. */
export async function ensureTelegramWebhook(fallbackOrigin: string): Promise<boolean> {
  const secret = telegramWebhookSecret();
  if (!secret) return false;
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const target = `${host ? `https://${host}` : fallbackOrigin}/api/telegram`;
  const info = await telegram<{ url?: string }>("getWebhookInfo", {});
  if (info.ok && info.result?.url === target) return true;
  const set = await telegram("setWebhook", { url: target, secret_token: secret, allowed_updates: ["message"], drop_pending_updates: true });
  if (!set.ok) console.warn("[rome-pay] setWebhook failed", set.description);
  return set.ok;
}
