import Link from "next/link";
import s from "./home.module.css";

export default function Home() {
  return (
    <main className={s.home}>
      <h1 className={s.title}>Rome Pay</h1>
      <p className={s.lead}>
        USDC payment links on Rome. Customers pay from MetaMask or Solflare; the merchant gets the same on-chain receipt
        either way.
      </p>
      <Link className={s.cta} href="/dashboard">
        Create a payment link
      </Link>
      <nav className={s.more} aria-label="More">
        <Link href="/pay/demo">Try the demo checkout</Link>
        <Link href="/earnings">How Rome Pay earns</Link>
      </nav>
    </main>
  );
}
