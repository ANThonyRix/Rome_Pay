import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import d from "@/components/dashboard/dashboard.module.css";
import SiteHeader from "@/components/SiteHeader";
import { addressUrl, CHAIN, txUrl } from "@/lib/chain";
import { dbConfigured } from "@/lib/db";
import { fmt, short } from "@/lib/format";
import { publicClient, ROUTER_ABI } from "@/lib/server-chain";
import { recentPayments, syncQuietly, totals, type Payment, type Totals } from "@/lib/store";

export const metadata: Metadata = {
  title: "How Rome Pay earns",
  description: "Rome Pay takes a fee from each payment, paid to its treasury in the same transaction. Live numbers from the PayRouter contract.",
};

/** The contract refuses any fee above this (PayRouter.MAX_FEE_BPS). */
const MAX_FEE_BPS = 100;
const EXAMPLE = 10_000_000n; // 10 USDC

const usdc = (value: bigint) => fmt(value, 6);
const when = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});
const percent = (bps: number) => `${(bps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;

export default function EarningsPage() {
  return (
    <div className={d.page}>
      <SiteHeader current="earnings" />
      <main className={d.main}>
        <div className={d.heading}>
          <h1 className={d.title}>How Rome Pay earns</h1>
          <p className={d.lead}>
            Each payment sends a small fee to the Rome Pay treasury, inside the same transaction that pays the merchant.
            There is no signup or monthly charge. The numbers below are read from the PayRouter contract on{" "}
            {CHAIN.name}
            {CHAIN.testnet ? ", a testnet: the USDC here has no real value" : ""}.
          </p>
        </div>
        <Suspense fallback={<p className={d.muted}>Reading the contract…</p>}>
          <Ledger />
        </Suspense>
      </main>
    </div>
  );
}

interface Chain {
  feeBps: number;
}

async function readChain(): Promise<Chain | null> {
  try {
    const feeBps = await publicClient.readContract({ address: CHAIN.payRouter, abi: ROUTER_ABI, functionName: "feeBps" });
    return { feeBps };
  } catch (err) {
    console.error("earnings: chain read failed", err);
    return null;
  }
}

async function readBook(): Promise<{ sums: Totals; recent: Payment[] } | null> {
  if (!dbConfigured()) return null;
  try {
    await syncQuietly();
    const [sums, recent] = await Promise.all([totals(), recentPayments(20)]);
    return { sums, recent };
  } catch (err) {
    console.error("earnings: database read failed", err);
    return null;
  }
}

async function Ledger() {
  await connection();
  const [chain, book] = await Promise.all([readChain(), readBook()]);
  const bps = chain?.feeBps ?? null;
  const fee = bps === null ? null : (EXAMPLE * BigInt(bps)) / 10_000n;

  return (
    <>
      <dl className={d.stats}>
        <div>
          <dt>Fee per payment</dt>
          <dd>{bps === null ? "—" : percent(bps)}</dd>
        </div>
        <div>
          <dt>Paid through links</dt>
          <dd>
            {book ? usdc(book.sums.volume) : "—"} <small>USDC</small>
          </dd>
        </div>
        <div>
          <dt>Payments</dt>
          <dd>{book ? book.sums.payments : "—"}</dd>
        </div>
      </dl>
      {!chain ? <p className={d.error}>Rome did not answer, so the fee rate is missing. Reload in a minute.</p> : null}

      <div className={d.grid}>
        <aside className={d.side}>
          <section aria-labelledby="split-title">
            <h2 id="split-title" className={d.sectionTitle}>
              A 10 USDC payment
            </h2>
            {fee === null ? (
              <p className={d.muted}>The split appears once the fee is read from the contract.</p>
            ) : (
              <>
                <div className={d.split} aria-hidden="true">
                  <span style={{ flexGrow: Number(EXAMPLE - fee) }} />
                  <span style={{ flexGrow: Number(fee) }} />
                </div>
                <dl className={d.facts}>
                  <div>
                    <dt>Payer sends</dt>
                    <dd>{usdc(EXAMPLE)} USDC</dd>
                  </div>
                  <div>
                    <dt>Merchant gets</dt>
                    <dd>{usdc(EXAMPLE - fee)} USDC</dd>
                  </div>
                  <div>
                    <dt>Treasury gets</dt>
                    <dd>{usdc(fee)} USDC</dd>
                  </div>
                </dl>
              </>
            )}
          </section>

          <section aria-labelledby="rules-title">
            <h2 id="rules-title" className={d.sectionTitle}>
              The rules
            </h2>
            <dl className={d.facts}>
              <div>
                <dt>Highest fee the contract allows</dt>
                <dd>{percent(MAX_FEE_BPS)}</dd>
              </div>
              <div>
                <dt>Contract</dt>
                <dd>
                  <a className={d.mono} href={addressUrl(CHAIN.payRouter)} target="_blank" rel="noreferrer">
                    {short(CHAIN.payRouter)}
                  </a>
                </dd>
              </div>
            </dl>
            <p className={d.note}>
              The fee can be lowered or raised by the contract owner, never above the cap. Every change emits a
              FeeUpdated event you can find on the explorer.
            </p>
          </section>
        </aside>

        <section className={d.content} aria-labelledby="recent-title">
          <div>
            <h2 id="recent-title" className={d.sectionTitle}>
              Latest payments
            </h2>
            {!book ? (
              <p className={d.empty}>The payment log is offline right now. The contract numbers above are still live.</p>
            ) : book.recent.length ? (
              <RecentTable payments={book.recent} />
            ) : (
              <p className={d.empty}>No payments yet. The first one through any Rome Pay link shows up here.</p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function RecentTable({ payments }: { payments: Payment[] }) {
  return (
    <table className={d.table}>
      <thead>
        <tr>
          <th scope="col">Date, UTC</th>
          <th scope="col">Merchant</th>
          <th scope="col" className={d.num}>Amount</th>
          <th scope="col">Receipt</th>
        </tr>
      </thead>
      <tbody>
        {payments.map((p) => (
          <tr key={`${p.txHash}:${p.logIndex}`}>
            <td data-label="Date">{p.blockTime ? when.format(p.blockTime) : "Pending"}</td>
            <td data-label="Merchant">
              <a className={d.mono} href={addressUrl(p.merchant)} target="_blank" rel="noreferrer">
                {short(p.merchant)}
              </a>
            </td>
            <td data-label="Amount" className={d.num}>{usdc(p.amount)}</td>
            <td data-label="Receipt">
              <a className={d.mono} href={txUrl(p.txHash)} target="_blank" rel="noreferrer">
                {short(p.txHash, 8, 4)}
              </a>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
