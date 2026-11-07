import Link from "next/link";
import s from "./home.module.css";

export default function NotFound() {
  return (
    <main className={s.home}>
      <h1 className={s.title}>Link not found</h1>
      <p className={s.lead}>
        This payment link does not exist or has expired. Nothing was charged. Ask the merchant for a new link.
      </p>
      <Link className={s.cta} href="/">
        Go to Rome Pay
      </Link>
    </main>
  );
}
