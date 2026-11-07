import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Checkout from "@/components/Checkout";
import CheckoutSkeleton from "@/components/CheckoutSkeleton";
import { fmt } from "@/lib/format";
import { getInvoice, toDTO } from "@/lib/invoices";

export async function generateMetadata({ params }: PageProps<"/pay/[id]">): Promise<Metadata> {
  const { id } = await params;
  const invoice = await getInvoice(id);
  if (!invoice) return { title: "Payment link not found" };
  return { title: `Pay ${fmt(invoice.amount, 6)} USDC to ${invoice.merchant.name}` };
}

// The params read sits inside Suspense so the shell can prerender (cacheComponents).
export default function PayPage({ params }: PageProps<"/pay/[id]">) {
  return (
    <Suspense fallback={<CheckoutSkeleton />}>
      <InvoiceCheckout params={params} />
    </Suspense>
  );
}

async function InvoiceCheckout({ params }: Pick<PageProps<"/pay/[id]">, "params">) {
  const { id } = await params;
  const invoice = await getInvoice(id);
  if (!invoice) notFound();
  return <Checkout invoice={toDTO(invoice)} />;
}
