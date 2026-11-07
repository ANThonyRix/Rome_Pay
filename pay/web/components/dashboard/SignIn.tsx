"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { stringToHex } from "viem";
import { createSiweMessage } from "viem/siwe";
import { CHAIN } from "@/lib/chain";
import { connectEvm, listEvmWallets, pickEvmWallet, type EvmWallet } from "@/lib/wallets";
import d from "./dashboard.module.css";

type Phase = "idle" | "connect" | "sign" | "verify";

export default function SignIn() {
  const router = useRouter();
  const [wallets, setWallets] = useState<EvmWallet[]>([]);
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stop = listEvmWallets(setWallets);
    // EIP-6963 wallets answer within a tick; after that, "no wallet" is a real answer.
    const timer = setTimeout(() => setReady(true), 400);
    return () => {
      stop();
      clearTimeout(timer);
    };
  }, []);

  const wallet = pickEvmWallet(wallets);

  const signIn = async () => {
    if (!wallet) return;
    setError(null);
    try {
      setPhase("connect");
      const address = await connectEvm(wallet);
      const nonceRes = await fetch("/api/auth/nonce", { method: "POST" });
      const { nonce, error: nonceError } = (await nonceRes.json()) as { nonce?: string; error?: string };
      if (!nonce) throw new Error(nonceError ?? "Could not start sign-in.");

      const message = createSiweMessage({
        address,
        chainId: CHAIN.chainId,
        domain: window.location.host,
        nonce,
        uri: window.location.origin,
        version: "1",
        statement: "Sign in to your Rome Pay dashboard. This costs nothing and sends no transaction.",
        issuedAt: new Date(),
      });
      setPhase("sign");
      const signature = (await wallet.provider.request({
        method: "personal_sign",
        params: [stringToHex(message), address],
      })) as `0x${string}`;

      setPhase("verify");
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, signature }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Sign-in failed.");
      router.refresh();
    } catch (err) {
      const code = (err as { code?: number })?.code;
      setError(code === 4001 ? "You closed the request in your wallet. Nothing was signed." : (err as Error).message);
      setPhase("idle");
    }
  };

  const label =
    phase === "connect"
      ? `Confirm in ${wallet?.name ?? "your wallet"}`
      : phase === "sign"
        ? `Sign the message in ${wallet?.name ?? "your wallet"}`
        : phase === "verify"
          ? "Opening your dashboard"
          : `Sign in with ${wallet?.name ?? "MetaMask"}`;

  return (
    <section className={d.signIn} aria-labelledby="signin-title">
      <h1 id="signin-title" className={d.signInTitle}>
        Your payment links, in one place
      </h1>
      <p className={d.lead}>
        Sign in with the wallet that receives your payments. You create links, see every payment and the fee taken
        from it. Signing in is a free message signature, not a transaction.
      </p>
      {ready && !wallet ? (
        <a className={d.primary} href="https://metamask.io/download/" target="_blank" rel="noreferrer">
          Install MetaMask
        </a>
      ) : (
        <button className={d.primary} type="button" onClick={signIn} disabled={!wallet || phase !== "idle"} aria-busy={phase !== "idle" || undefined}>
          {label}
        </button>
      )}
      <p className={d.error} role="alert">
        {error}
      </p>
    </section>
  );
}
