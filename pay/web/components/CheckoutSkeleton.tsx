import s from "./checkout.module.css";

/** Shown while the payment link loads: the plate's shape, no invented numbers. */
export default function CheckoutSkeleton() {
  return (
    <div className={s.page} aria-busy="true">
      <div className={s.top} />
      <main className={s.main}>
        <div className={`${s.plate} ${s.skeleton}`}>
          <p className={s.memo}>Loading payment details</p>
        </div>
      </main>
    </div>
  );
}
