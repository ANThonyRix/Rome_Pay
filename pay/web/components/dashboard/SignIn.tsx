"use client";

import { base58 } from "@scure/base";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { stringToHex } from "viem";
import { createSiweMessage } from "viem/siwe";
import { CHAIN } from "@/lib/chain";
import {
  connectEvm,
  connectSolana,
  listEvmWallets,
  listSolanaWallets,
  rememberSolanaWallet,
  signSolanaText,
  sortEvmWallets,
  solanaChainId,
  type EvmWallet,
  type SolanaWallet,
} from "@/lib/wallets";
import d from "./dashboard.module.css";

type Phase = "idle" | "connect" | "sign" | "verify";
type Lane = `evm:${string}` | `solana:${string}`;

const STATEMENT = "Sign in to your Rome Pay dashboard. This costs nothing and sends no transaction.";

/** Sign-In with Solana text (the lines Solana wallets render for SIWS). Checked in lib/auth.ts. */
const solanaMessage = (address: string, nonce: string) =>
  [
    `${window.location.host} wants you to sign in with your Solana account:`,
    address,
    "",
    STATEMENT,
    "",
    `URI: ${window.location.origin}`,
    "Version: 1",
    `Chain ID: ${solanaChainId(CHAIN.solanaCluster)}`,
    `Nonce: ${nonce}`,
    `Issued At: ${new Date().toISOString()}`,
  ].join("\n");

async function startSignIn(): Promise<string> {
  const res = await fetch("/api/auth/nonce", { method: "POST" });
  const { nonce, error } = (await res.json()) as { nonce?: string; error?: string };
  if (!nonce) throw new Error(error ?? "Could not start sign-in.");
  return nonce;
}

async function finishSignIn(payload: object) {
  const res = await fetch("/api/auth/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(body.error ?? "Sign-in failed.");
}

export default function SignIn() {
  const router = useRouter();
  const [evmWallets, setEvmWallets] = useState<EvmWallet[]>([]);
  const [solanaWallets, setSolanaWallets] = useState<SolanaWallet[]>([]);
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [lane, setLane] = useState<Lane | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stopEvm = listEvmWallets(setEvmWallets);
    const stopSolana = listSolanaWallets(CHAIN.solanaCluster, setSolanaWallets);
    // Wallets announce themselves within a tick; after that, "no wallet" is a real answer.
    const timer = setTimeout(() => setReady(true), 400);
    return () => {
      stopEvm();
      stopSolana();
      clearTimeout(timer);
    };
  }, []);

  // One button per installed wallet. The dashboard belongs to the address, not the wallet app:
  // the same 0x address (MetaMask, Rabby, ...) or the same Solana key (Solflare, Phantom, ...) opens the same one.
  const evm = sortEvmWallets(evmWallets).slice(0, 3);
  const solana = solanaWallets.slice(0, 3);
  const busy = phase !== "idle";

  const run = async (which: Lane, steps: () => Promise<void>) => {
    setError(null);
    setLane(which);
    try {
      await steps();
      router.refresh();
    } catch (err) {
      const code = (err as { code?: number })?.code;
      const rejected = code === 4001 || /reject|declin|cancel/i.test((err as Error)?.message ?? "");
      setError(rejected ? "You closed the request in your wallet. Nothing was signed." : (err as Error).message);
      setPhase("idle");
      setLane(null);
    }
  };

  const signInEvm = (wallet: EvmWallet) => {
    void run(`evm:${wallet.rdns}`, async () => {
      setPhase("connect");
      const address = await connectEvm(wallet);
      const nonce = await startSignIn();
      const message = createSiweMessage({
        address,
        chainId: CHAIN.chainId,
        domain: window.location.host,
        nonce,
        uri: window.location.origin,
        version: "1",
        statement: STATEMENT,
        issuedAt: new Date(),
      });
      setPhase("sign");
      const signature = (await wallet.provider.request({
        method: "personal_sign",
        params: [stringToHex(message), address],
      })) as `0x${string}`;
      setPhase("verify");
      await finishSignIn({ message, signature });
    });
  };

  const signInSolana = (wallet: SolanaWallet) => {
    void run(`solana:${wallet.name}`, async () => {
      setPhase("connect");
      const account = await connectSolana(wallet);
      const nonce = await startSignIn();
      const message = solanaMessage(account.address, nonce);
      setPhase("sign");
      const signature = await signSolanaText(wallet, account, message);
      setPhase("verify");
      await finishSignIn({ kind: "solana", message, signature: base58.encode(signature) });
      rememberSolanaWallet(wallet.name);
    });
  };

  const label = (which: Lane, name: string) => {
    if (lane !== which) return `Sign in with ${name}`;
    if (phase === "connect") return `Confirm in ${name}`;
    if (phase === "sign") return `Sign the message in ${name}`;
    return "Opening your dashboard";
  };

  return (
    <section className={d.signIn} aria-labelledby="signin-title">
      <h1 id="signin-title" className={d.signInTitle}>
        Your payment links, in one place
      </h1>
      <p className={d.lead}>
        Sign in with the wallet that receives your payments. You create links, see every payment and the fee taken from
        it. Signing in is a free message signature, not a transaction.
      </p>
      <div className={d.signInGroup} role="group" aria-labelledby="signin-evm">
        <span id="signin-evm" className={d.label}>
          EVM address
        </span>
        <div className={d.signInActions}>
          {evm.length > 0 ? (
            evm.map((wallet, i) => {
              const which: Lane = `evm:${wallet.rdns}`;
              return (
                <button
                  key={wallet.rdns}
                  className={i === 0 ? d.primary : d.secondary}
                  type="button"
                  onClick={() => signInEvm(wallet)}
                  disabled={busy}
                  aria-busy={(lane === which && busy) || undefined}
                >
                  {label(which, wallet.name)}
                </button>
              );
            })
          ) : ready ? (
            <a className={d.primary} href="https://metamask.io/download/" target="_blank" rel="noreferrer">
              Install MetaMask
            </a>
          ) : (
            <button className={d.primary} type="button" disabled>
              Sign in with MetaMask
            </button>
          )}
        </div>
      </div>
      <div className={d.signInGroup} role="group" aria-labelledby="signin-solana">
        <span id="signin-solana" className={d.label}>
          Solana address
        </span>
        <div className={d.signInActions}>
          {solana.length > 0 ? (
            solana.map((wallet) => {
              const which: Lane = `solana:${wallet.name}`;
              return (
                <button
                  key={wallet.name}
                  className={d.secondary}
                  type="button"
                  onClick={() => signInSolana(wallet)}
                  disabled={busy}
                  aria-busy={(lane === which && busy) || undefined}
                >
                  {label(which, wallet.name)}
                </button>
              );
            })
          ) : ready ? (
            <a className={d.secondary} href="https://solflare.com/download" target="_blank" rel="noreferrer">
              Install Solflare
            </a>
          ) : (
            <button className={d.secondary} type="button" disabled>
              Sign in with Solflare
            </button>
          )}
        </div>
      </div>
      <p className={d.note}>
        Your dashboard belongs to your address, not to the wallet app: the same address opens the same dashboard in any
        wallet. With a Solana address, payments arrive at its Rome address and you move them back from the dashboard.
      </p>
      <p className={d.error} role="alert">
        {error}
      </p>
    </section>
  );
}
