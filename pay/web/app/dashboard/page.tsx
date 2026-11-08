import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import CopyLink from "@/components/dashboard/CopyLink";
import DeleteLink from "@/components/dashboard/DeleteLink";
import NameForm from "@/components/dashboard/NameForm";
import NewLinkForm from "@/components/dashboard/NewLinkForm";
import Reveal from "@/components/dashboard/Reveal";
import SignIn from "@/components/dashboard/SignIn";
import d from "@/components/dashboard/dashboard.module.css";
import SiteHeader from "@/components/SiteHeader";
import { currentMerchant } from "@/lib/auth";
import { addressUrl, txUrl } from "@/lib/chain";
import { dbConfigured } from "@/lib/db";
import { fmt, short } from "@/lib/format";
import { listLinks, listPayments, syncQuietly, totals, type LinkSummary, type Payment } from "@/lib/store";
import { setArchivedAction, signOutAction } from "./actions";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false } };

export default function DashboardPage() {
  return (
    <div className={d.page}>
      <Suspense fallback={<SiteHeader current="dashboard" />}>
        <Dashboard />
      </Suspense>
    </div>
  );
}

const usdc = (value: bigint) => fmt(value, 6);
const when = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

async function Dashboard() {
  // Env is read at request time; without this the no-database branch would be prerendered.
  await connection();
  if (!dbConfigured()) {
    return (
      <>
        <SiteHeader current="dashboard" />
        <main className={d.signIn}>
          <h1 className={d.signInTitle}>Dashboard is offline</h1>
          <p className={d.lead}>This deployment has no database connected, so sign-in is turned off. Payment links still work.</p>
        </main>
      </>
    );
  }

  const merchant = await currentMerchant();
  if (!merchant) {
    return (
      <>
        <SiteHeader current="dashboard" />
        <main>
          <SignIn />
        </main>
      </>
    );
  }

  await syncQuietly();
  const [links, payments, sums] = await Promise.all([
    listLinks(merchant.address),
    listPayments(merchant.address),
    totals(merchant.address),
  ]);
  const openLinks = links.filter((link) => link.status === "open").length;

  return (
    <>
      <SiteHeader current="dashboard">
        <a className={d.account} href={addressUrl(merchant.address)} target="_blank" rel="noreferrer" title={merchant.address}>
          {short(merchant.address)}
        </a>
        <form action={signOutAction}>
          <button className={d.textButton} type="submit">
            Sign out
          </button>
        </form>
      </SiteHeader>

      <main className={d.main}>
        <div className={d.heading}>
          <h1 className={d.title}>{merchant.name || "Your dashboard"}</h1>
          <dl className={d.stats}>
            <div>
              <dt>You received</dt>
              <dd>
                {usdc(sums.volume - sums.fees)} <small>USDC</small>
              </dd>
            </div>
            <div>
              <dt>Payments</dt>
              <dd>{sums.payments}</dd>
            </div>
            <div>
              <dt>Fees paid</dt>
              <dd>
                {usdc(sums.fees)} <small>USDC</small>
              </dd>
            </div>
            <div>
              <dt>Open links</dt>
              <dd>{openLinks}</dd>
            </div>
          </dl>
        </div>

        <div className={d.grid}>
          <aside className={d.side}>
            <NewLinkForm />
            <NameForm name={merchant.name} />
          </aside>

          <div className={d.content}>
            <section aria-labelledby="links-title">
              <h2 id="links-title" className={d.sectionTitle}>
                Links
              </h2>
              {links.length ? <LinksTable links={links} /> : (
                <p className={d.empty}>No links yet. Create one with the form; it shows up here with its payments.</p>
              )}
            </section>

            <section aria-labelledby="history-title">
              <h2 id="history-title" className={d.sectionTitle}>
                Payment history
              </h2>
              {payments.length ? <HistoryTable payments={payments} /> : (
                <p className={d.empty}>
                  No payments yet. When someone pays one of your links, it appears here a few seconds after Rome confirms it.
                </p>
              )}
            </section>
          </div>
        </div>
      </main>
    </>
  );
}

const STATUS: Record<LinkSummary["status"], string> = { open: "Open", paid: "Paid", archived: "Closed" };

function LinksTable({ links }: { links: LinkSummary[] }) {
  return (
    <Reveal
      noun="links"
      step={5}
      head={
        <tr>
          <th scope="col">For</th>
          <th scope="col" className={d.num}>Amount</th>
          <th scope="col">Status</th>
          <th scope="col" className={d.num}>Paid</th>
          <th scope="col" className={d.num}>Received</th>
          <th scope="col"><span className="visually-hidden">Actions</span></th>
        </tr>
      }
      rows={links.map((link) => (
        <tr key={link.id} data-status={link.status}>
          <td data-label="For">
            <span className={d.memo}>{link.memo}</span>
            <code className={d.code}>/pay/{link.id}</code>
            {link.reusable && link.amount !== null ? <span className={d.tag}>Reusable</span> : null}
          </td>
          <td data-label="Amount" className={d.num}>
            {link.amount === null ? "Payer enters" : `${usdc(link.amount)} USDC`}
          </td>
          <td data-label="Status">
            <span className={d.status} data-status={link.status}>{STATUS[link.status]}</span>
          </td>
          <td data-label="Paid" className={d.num}>{link.paidCount}</td>
          <td data-label="Received" className={d.num}>{usdc(link.received)}</td>
          <td className={d.actions}>
            {link.status !== "archived" ? <CopyLink id={link.id} label="Copy" /> : null}
            {link.status !== "archived" ? (
              <Link className={d.textButton} href={`/pay/${link.id}`} target="_blank">
                Open
              </Link>
            ) : null}
            <form action={setArchivedAction}>
              <input type="hidden" name="id" value={link.id} />
              <input type="hidden" name="archived" value={link.status === "archived" ? "0" : "1"} />
              <button className={d.textButton} type="submit">
                {link.status === "archived" ? "Reopen" : "Close"}
              </button>
            </form>
            {link.paidCount === 0 ? <DeleteLink id={link.id} /> : null}
          </td>
        </tr>
      ))}
    />
  );
}

function HistoryTable({ payments }: { payments: Payment[] }) {
  return (
    <Reveal
      noun="payments"
      step={10}
      head={
        <tr>
          <th scope="col">Date, UTC</th>
          <th scope="col">For</th>
          <th scope="col">Payer</th>
          <th scope="col" className={d.num}>Amount</th>
          <th scope="col" className={d.num}>Fee</th>
          <th scope="col" className={d.num}>You got</th>
          <th scope="col">Receipt</th>
        </tr>
      }
      rows={payments.map((p) => (
        <tr key={`${p.txHash}:${p.logIndex}`}>
          <td data-label="Date">{p.blockTime ? when.format(p.blockTime) : "Pending"}</td>
          <td data-label="For">{p.memo ?? <span className={d.muted}>Not from a link</span>}</td>
          <td data-label="Payer">
            <a className={d.mono} href={addressUrl(p.payer)} target="_blank" rel="noreferrer">
              {short(p.payer)}
            </a>
          </td>
          <td data-label="Amount" className={d.num}>{usdc(p.amount)}</td>
          <td data-label="Fee" className={d.num}>{usdc(p.fee)}</td>
          <td data-label="You got" className={d.num}>{usdc(p.amount - p.fee)}</td>
          <td data-label="Receipt">
            <a className={d.mono} href={txUrl(p.txHash)} target="_blank" rel="noreferrer">
              {short(p.txHash, 8, 4)}
            </a>
          </td>
        </tr>
      ))}
    />
  );
}
