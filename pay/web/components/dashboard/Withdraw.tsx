"use client";

import { PublicKey } from "@solana/web3.js";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CHAIN, txUrl } from "@/lib/chain";
import { fmt, short } from "@/lib/format";
import { explainError, runWithdraw, type WithdrawStep } from "@/lib/payflow";
import {
  connectSolana,
  isKnownV1Gap,
  laneSigner,
  listSolanaWallets,
  preferredSolanaWallet,
  type SolanaWallet,
} from "@/lib/wallets";
import d from "./dashboard.module.css";

const STEP_LABEL: Record<WithdrawStep, string> = {
  provision: "Approve the one-time account setup",
  account: "Approve creating your USDC account",
  move: "Approve the transfer",
};

/**
 * Solana merchants are paid into their Rome address (the synthetic of their Solflare key).
 * This moves that whole balance back to the Solflare wallet they signed in with.
 */
export default function Withdraw({ pubkey, balance }: { pubkey: string; balance: string }) {
  const router = useRouter();
  const [wallets, setWallets] = useState<SolanaWallet[]>([]);
  const [step, setStep] = useState<WithdrawStep | "connect" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ hash: string; amount: bigint } | null>(null);

  useEffect(() => listSolanaWallets(CHAIN.solanaCluster, setWallets), []);

  const wallet = preferredSolanaWallet(wallets);
  const amount = BigInt(balance);
  const busy = step !== null;

  const withdraw = async () => {
    if (!wallet) return;
    setError(null);
    setDone(null);
    try {
      setStep("connect");
      const account = await connectSolana(wallet);
      if (account.address !== pubkey) {
        throw new Error(`${wallet.name} is on account ${short(account.address)}. Switch to ${short(pubkey)}, the one you signed in with.`);
      }
      const result = await runWithdraw(laneSigner(wallet, account, CHAIN.solanaCluster), new PublicKey(pubkey), setStep);
      setDone(result);
      router.refresh();
    } catch (err) {
      setError(explainError(err, wallet.name));
    } finally {
      setStep(null);
    }
  };

  const label =
    step === "connect" ? `Confirm in ${wallet?.name ?? "Solflare"}` : step ? STEP_LABEL[step] : `Move to ${wallet?.name ?? "Solflare"}`;

  return (
    <section className={d.withdraw} aria-labelledby="withdraw-title">
      <div className={d.withdrawText}>
        <h2 id="withdraw-title" className={d.label}>
          On your Rome address
        </h2>
        <p className={d.withdrawAmount}>
          {fmt(amount, 6)} <small>USDC</small>
        </p>
        <p className={d.note}>
          Payments land here. Move them to your wallet <span className={d.mono}>{short(pubkey)}</span> when you like.
        </p>
      </div>
      <div className={d.withdrawAction}>
        <button
          className={d.secondary}
          type="button"
          onClick={withdraw}
          disabled={!wallet || busy || amount === 0n}
          aria-busy={busy || undefined}
        >
          {label}
        </button>
        <p className={error ? d.error : d.note} role="status" aria-live="polite">
          {error ??
            (done ? (
              <>
                Moved {fmt(done.amount, 6)} USDC.{" "}
                <a href={txUrl(done.hash)} target="_blank" rel="noreferrer">
                  Receipt
                </a>
              </>
            ) : !wallet ? (
              "Open this page in a browser with the wallet you signed in with to move funds."
            ) : amount === 0n ? (
              "Nothing to move yet."
            ) : isKnownV1Gap(wallet) ? (
              `${wallet.name} may refuse this Rome transaction on testnet. If it does, import the same key into Solflare and move from there.`
            ) : (
              "Solana network fees are paid in SOL from your wallet."
            ))}
        </p>
      </div>
    </section>
  );
}
