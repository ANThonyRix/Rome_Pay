import Link from "next/link";
import { CHAIN } from "@/lib/chain";
import s from "./site.module.css";

type Section = "dashboard" | "earnings" | null;

export default function SiteHeader({ current = null, children }: { current?: Section; children?: React.ReactNode }) {
  return (
    <header className={s.top}>
      <Link className={s.wordmark} href="/" aria-label="Rome Pay home">
        <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
          <circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" strokeWidth="4" />
          <rect x="2" y="13.5" width="28" height="5" fill="currentColor" />
        </svg>
        <span>Rome Pay</span>
      </Link>
      <nav className={s.nav} aria-label="Main">
        <Link href="/dashboard" aria-current={current === "dashboard" ? "page" : undefined}>
          Dashboard
        </Link>
        <Link href="/earnings" aria-current={current === "earnings" ? "page" : undefined}>
          Earnings
        </Link>
      </nav>
      <div className={s.end}>
        <span className={s.network}>
          {CHAIN.name}
          {CHAIN.testnet ? <em>Testnet</em> : null}
        </span>
        {children}
      </div>
    </header>
  );
}
