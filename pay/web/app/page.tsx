import Link from "next/link";
import s from "./home.module.css";

export default function Home() {
  return (
    <main className={s.home}>
      <h1 className={s.title}>Rome Pay</h1>
      <p className={s.lead}>
        Create a payment link to get paid in USDC for goods and services, or to receive donations. Payers use MetaMask
        or Solflare.
      </p>
      <Link className={s.cta} href="/dashboard">
        Create a payment link
      </Link>
      <nav className={s.more} aria-label="More">
        <Link href="/pay/demo">Try the demo checkout</Link>
        <Link href="/faq">How it works</Link>
      </nav>
    </main>
  );
}
