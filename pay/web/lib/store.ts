import "server-only";
import { randomBytes } from "node:crypto";
import { base58 } from "@scure/base";
import { getAddress, parseEventLogs, type Hex, type Log } from "viem";
import { CHAIN } from "./chain";
import { db, dbConfigured } from "./db";
import { DEMO_LINK, LINK_ID, refFor, type LinkStatus, type PaymentLink } from "./invoices";
import { LOG_SPAN, PAID_EVENT, ROUTER_FROM_BLOCK, publicClient } from "./server-chain";

type Row = Record<string, unknown>;
const lower = (address: string) => address.toLowerCase();

// ------------------------------------------------------------------ merchants

export interface Merchant {
  address: Hex;
  name: string;
}

export async function upsertMerchant(address: Hex): Promise<void> {
  await db()`insert into merchants (address) values (${lower(address)}) on conflict (address) do nothing`;
}

export async function getMerchant(address: Hex): Promise<Merchant | null> {
  const [row] = await db()`select address, name from merchants where address = ${lower(address)}`;
  return row ? { address: getAddress(row.address as string), name: row.name as string } : null;
}

export async function setMerchantName(address: Hex, name: string): Promise<void> {
  await db()`update merchants set name = ${name} where address = ${lower(address)}`;
}

// ---------------------------------------------------------------------- links

const toLink = (row: Row): PaymentLink => ({
  id: row.id as string,
  merchant: { name: (row.merchant_name as string) || "", address: getAddress(row.merchant as string) },
  amount: row.amount === null ? null : BigInt(row.amount as string),
  memo: row.memo as string,
  ref: row.ref as Hex,
  reusable: row.reusable as boolean,
  status: row.status as LinkStatus,
});

/** A link for the checkout: the demo link, or a row from the database. */
export async function getLink(id: string): Promise<PaymentLink | null> {
  if (id === DEMO_LINK.id) return DEMO_LINK;
  if (!LINK_ID.test(id) || !dbConfigured()) return null;
  const [row] = await db()`
    select i.*, m.name as merchant_name
    from invoices i join merchants m on m.address = i.merchant
    where i.id = ${id}`;
  return row ? toLink(row) : null;
}

export interface NewLink {
  amount: bigint | null;
  memo: string;
  reusable: boolean;
}

export async function createLink(merchant: Hex, input: NewLink): Promise<string> {
  // 8 random bytes = 11 base58 chars; retry on the (astronomically rare) collision.
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = base58.encode(randomBytes(8));
    const rows = await db()`
      insert into invoices (id, merchant, ref, amount, memo, reusable)
      values (${id}, ${lower(merchant)}, ${refFor(id)}, ${input.amount?.toString() ?? null}, ${input.memo}, ${input.reusable})
      on conflict do nothing
      returning id`;
    if (rows.length) return id;
  }
  throw new Error("Could not allocate a link id");
}

export interface LinkSummary extends PaymentLink {
  createdAt: Date;
  paidCount: number;
  received: bigint; // gross amount of matched payments
}

export async function listLinks(merchant: Hex): Promise<LinkSummary[]> {
  const rows = await db()`
    select i.*, m.name as merchant_name,
      count(p.tx_hash)::int as paid_count,
      coalesce(sum(p.amount), 0)::text as received
    from invoices i
    join merchants m on m.address = i.merchant
    left join payments p on p.invoice_id = i.id
    where i.merchant = ${lower(merchant)}
    group by i.id, m.name
    order by i.created_at desc
    limit 200`;
  return rows.map((row) => ({
    ...toLink(row),
    createdAt: new Date(row.created_at as string),
    paidCount: row.paid_count as number,
    received: BigInt(row.received as string),
  }));
}

export async function setLinkArchived(merchant: Hex, id: string, archived: boolean): Promise<void> {
  // Archiving closes a link; reopening restores "paid" when it already took a single-use payment.
  await db()`
    update invoices set status = case
      when ${archived} then 'archived'
      when paid_at is not null and not reusable then 'paid'
      else 'open' end
    where id = ${id} and merchant = ${lower(merchant)}`;
}

/**
 * Deletes a link that never took a payment. Links with payments are only closed, so the
 * history keeps saying what each payment was for.
 */
export async function deleteUnpaidLink(merchant: Hex, id: string): Promise<void> {
  await db()`
    delete from invoices i
    where i.id = ${id} and i.merchant = ${lower(merchant)}
      and not exists (select 1 from payments p where p.invoice_id = i.id)`;
}

// ------------------------------------------------------------------- payments

export interface Payment {
  txHash: Hex;
  logIndex: number;
  blockTime: Date | null;
  invoiceId: string | null;
  memo: string | null;
  merchant: Hex;
  payer: Hex;
  amount: bigint;
  fee: bigint;
}

const toPayment = (row: Row): Payment => ({
  txHash: row.tx_hash as Hex,
  logIndex: Number(row.log_index),
  blockTime: row.block_time ? new Date(row.block_time as string) : null,
  invoiceId: (row.invoice_id as string) ?? null,
  memo: (row.memo as string) ?? null,
  merchant: getAddress(row.merchant as string),
  payer: getAddress(row.payer as string),
  amount: BigInt(row.amount as string),
  fee: BigInt(row.fee as string),
});

export async function listPayments(merchant: Hex, limit = 100): Promise<Payment[]> {
  const rows = await db()`
    select p.*, i.memo from payments p left join invoices i on i.id = p.invoice_id
    where p.merchant = ${lower(merchant)}
    order by p.block_number desc, p.log_index desc
    limit ${limit}`;
  return rows.map(toPayment);
}

export async function recentPayments(limit = 20): Promise<Payment[]> {
  const rows = await db()`
    select p.*, null as memo from payments p
    order by p.block_number desc, p.log_index desc
    limit ${limit}`;
  return rows.map(toPayment);
}

export interface Totals {
  payments: number;
  volume: bigint;
  fees: bigint;
  merchants: number;
}

export async function totals(merchant?: Hex): Promise<Totals> {
  const [row] = merchant
    ? await db()`
        select count(*)::int as payments, coalesce(sum(amount), 0)::text as volume,
          coalesce(sum(fee), 0)::text as fees, count(distinct merchant)::int as merchants
        from payments where merchant = ${lower(merchant)}`
    : await db()`
        select count(*)::int as payments, coalesce(sum(amount), 0)::text as volume,
          coalesce(sum(fee), 0)::text as fees, count(distinct merchant)::int as merchants
        from payments`;
  return {
    payments: row.payments as number,
    volume: BigInt(row.volume as string),
    fees: BigInt(row.fees as string),
    merchants: row.merchants as number,
  };
}

type PaidLog = Log<bigint, number, false, typeof PAID_EVENT, true, [typeof PAID_EVENT], "Paid">;

/**
 * Stores Paid events (idempotent by tx hash + position of the event in the tx). A payment is linked to an invoice only
 * when the ref, the merchant and, for fixed amounts, the amount all match; a single-use invoice
 * is then marked paid. Unmatched events are still stored: they count towards protocol totals.
 */
async function storePaidLogs(logs: PaidLog[]): Promise<number> {
  if (!logs.length) return 0;
  const blockNumbers = [...new Set(logs.map((log) => log.blockNumber))];
  const times = new Map<bigint, number>();
  await Promise.all(
    blockNumbers.map(async (blockNumber) => {
      const block = await publicClient.getBlock({ blockNumber });
      times.set(blockNumber, Number(block.timestamp));
    }),
  );

  // Rome's RPC reports different logIndex values for the same log in receipts and in eth_getLogs,
  // so the stored key is the event's position among the router's Paid events in its transaction.
  // Both callers pass every Paid log of a transaction together, which keeps the position stable.
  const ordered = [...logs].sort((a, b) =>
    a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1,
  );
  const seen = new Map<string, number>();
  const ordinals = new Map<PaidLog, number>();
  for (const log of ordered) {
    const tx = lower(log.transactionHash);
    const ordinal = seen.get(tx) ?? 0;
    ordinals.set(log, ordinal);
    seen.set(tx, ordinal + 1);
  }

  const sql = db();
  const results = await sql.transaction(
    ordered.map((log) => {
      const { ref, merchant, payer, amount, fee } = log.args;
      return sql`
        with ins as (
          insert into payments (tx_hash, log_index, block_number, block_time, ref, invoice_id, merchant, payer, amount, fee)
          values (
            ${lower(log.transactionHash)}, ${ordinals.get(log)}, ${log.blockNumber.toString()},
            to_timestamp(${times.get(log.blockNumber) ?? null}::double precision), ${lower(ref)},
            (select id from invoices i
              where i.ref = ${lower(ref)} and i.merchant = ${lower(merchant)}
                and (i.amount is null or i.amount = ${amount.toString()}::numeric)),
            ${lower(merchant)}, ${lower(payer)}, ${amount.toString()}, ${fee.toString()})
          on conflict do nothing
          returning invoice_id, block_time
        ),
        upd as (
          update invoices set status = 'paid', paid_at = coalesce(invoices.paid_at, ins.block_time, now())
          from ins
          where invoices.id = ins.invoice_id and not invoices.reusable and invoices.status = 'open'
          returning invoices.id
        )
        select (select count(*) from ins)::int as inserted`;
    }),
  );
  return results.reduce((sum, rows) => sum + ((rows[0]?.inserted as number) ?? 0), 0);
}

export type VerifyResult =
  | { status: "pending" }
  | { status: "reverted" }
  | { status: "confirmed"; payments: number; stored: number };

/** Verifies one transaction by its receipt and stores its Paid events. */
export async function verifyPaymentTx(hash: Hex): Promise<VerifyResult> {
  let receipt;
  try {
    receipt = await publicClient.getTransactionReceipt({ hash });
  } catch {
    return { status: "pending" };
  }
  if (receipt.status !== "success") return { status: "reverted" };
  const router = lower(CHAIN.payRouter);
  const logs = parseEventLogs({
    abi: [PAID_EVENT],
    eventName: "Paid",
    logs: receipt.logs.filter((log) => lower(log.address) === router),
  }) as PaidLog[];
  return { status: "confirmed", payments: logs.length, stored: await storePaidLogs(logs) };
}

const SYNC_KEY = `paid:${CHAIN.chainId}:${lower(CHAIN.payRouter)}`;

export interface SyncResult {
  head: bigint;
  cursor: bigint;
  stored: number;
  caughtUp: boolean;
  skipped?: boolean;
}

/**
 * Scans PayRouter Paid logs from the stored cursor towards the chain head, in LOG_SPAN chunks.
 * `minIntervalMs` skips the scan when another request ran one recently (page opens call this).
 */
export async function syncPaid({ maxSpans = 3, minIntervalMs = 0 } = {}): Promise<SyncResult> {
  const sql = db();
  const [state] = await sql`select block::text as block, updated_at from sync_state where key = ${SYNC_KEY}`;
  const cursor0 = state ? BigInt(state.block as string) : ROUTER_FROM_BLOCK - 1n;
  if (state && minIntervalMs > 0 && Date.now() - new Date(state.updated_at as string).getTime() < minIntervalMs) {
    return { head: cursor0, cursor: cursor0, stored: 0, caughtUp: true, skipped: true };
  }

  const head = await publicClient.getBlockNumber();
  let cursor = cursor0;
  let stored = 0;
  for (let span = 0; span < maxSpans && cursor < head; span++) {
    const fromBlock = cursor + 1n;
    const toBlock = fromBlock + LOG_SPAN - 1n < head ? fromBlock + LOG_SPAN - 1n : head;
    const logs = await publicClient.getLogs({ address: CHAIN.payRouter, event: PAID_EVENT, fromBlock, toBlock, strict: true });
    stored += await storePaidLogs(logs as PaidLog[]);
    cursor = toBlock;
    await sql`
      insert into sync_state (key, block) values (${SYNC_KEY}, ${cursor.toString()})
      on conflict (key) do update set block = greatest(sync_state.block, excluded.block), updated_at = now()`;
  }
  return { head, cursor, stored, caughtUp: cursor >= head };
}

/** Best-effort sync for page renders: never throws, never blocks long. */
export async function syncQuietly(): Promise<void> {
  try {
    await syncPaid({ maxSpans: 2, minIntervalMs: 20_000 });
  } catch (error) {
    console.warn("[rome-pay] sync failed", error instanceof Error ? error.message : error);
  }
}
