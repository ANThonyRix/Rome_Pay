import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Checkout from "@/components/Checkout";
import CheckoutSkeleton from "@/components/CheckoutSkeleton";
import { fmt, short } from "@/lib/format";
import { toDTO, type PaymentLink } from "@/lib/invoices";
import { getLink } from "@/lib/store";
import s from "../../home.module.css";

/** Merchants who have not set a display name are shown by their address. */
const withName = (link: PaymentLink): PaymentLink =>
  link.merchant.name ? link : { ...link, merchant: { ...link.merchant, name: short(link.merchant.address) } };

export async function generateMetadata({ params }: PageProps<"/pay/[id]">): Promise<Metadata> {
  const { id } = await params;
  const link = await getLink(id);
  if (!link || link.status === "archived") return { title: "Payment link not found", robots: { index: false } };
  const name = withName(link).merchant.name;
  const title = link.amount === null ? `Pay ${name} in USDC` : `Pay ${fmt(link.amount, 6)} USDC to ${name}`;
  return { title, robots: { index: false } };
}

// The params read sits inside Suspense so the shell can prerender (cacheComponents).
export default function PayPage({ params }: PageProps<"/pay/[id]">) {
  return (
    <Suspense fallback={<CheckoutSkeleton />}>
      <LinkCheckout params={params} />
    </Suspense>
  );
}

async function LinkCheckout({ params }: Pick<PageProps<"/pay/[id]">, "params">) {
  const { id } = await params;
  const link = await getLink(id);
  if (!link || link.status === "archived") notFound();
  if (link.status === "paid" && !link.reusable) return <AlreadyPaid link={withName(link)} />;
  return <Checkout link={toDTO(withName(link))} />;
}

function AlreadyPaid({ link }: { link: PaymentLink }) {
  return (
    <main className={s.home}>
      <h1 className={s.title}>Already paid</h1>
      <p className={s.lead}>
        {link.merchant.name} has received the payment for this link
        {link.amount === null ? "" : ` (${fmt(link.amount, 6)} USDC)`}. It takes one payment only, so nothing more can
        be sent here. Ask the merchant for a new link if you need to pay again.
      </p>
      <Link className={s.cta} href="/">
        Go to Rome Pay
      </Link>
    </main>
  );
}
