"use client";

import "@/lib/polyfills";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PublicKey } from "@solana/web3.js";
import type { Hex } from "viem";
import type { LaneSigner } from "@/vendor/rome-sdk";
import { CHAIN, FUNDING_LINKS, addressUrl, txUrl } from "@/lib/chain";
import { fmt, short } from "@/lib/format";
import { fromDTO, parseUsdc, type Invoice, type LinkDTO } from "@/lib/invoices";
import {
  LANE_STEPS,
  ensureEvmChain,
  estimateStep,
  explainError,
  planEvm,
  planSolana,
  readFeeBps,
  runEvmStep,
  runSolanaStep,
  type Lane,
  type Plan,
  type StepId,
  type StepResult,
} from "@/lib/payflow";
import {
  connectEvm,
  connectSolana,
  isKnownV1Gap,
  laneSigner,
  listEvmWallets,
  listSolanaWallets,
  pickEvmWallet,
  type EvmWallet,
  type SolanaWallet,
} from "@/lib/wallets";
import RouteMap, { type StationState } from "./RouteMap";
import Schematic from "./Schematic";
import s from "./checkout.module.css";

type Conn =
  | { lane: "evm"; wallet: EvmWallet; address: Hex }
  | { lane: "solana"; wallet: SolanaWallet; pubkey: PublicKey; signer: LaneSigner };

type Busy = null | "connect" | "plan" | { step: StepId; phase: "wallet" | "chain" };

const INSTALL = {
  evm: { name: "MetaMask", href: "https://metamask.io/download/" },
  solana: { name: "Solflare", href: "https://www.solflare.com/download/" },
} as const;

export default function Checkout({ link: dto }: { link: LinkDTO }) {
  const link = useMemo(() => fromDTO(dto), [dto]);
  // Open-amount links: the payer types the amount; 0n means "not entered yet".
  const openAmount = link.amount === null;
  const [typed, setTyped] = useState("");
  const typedAmount = openAmount ? parseUsdc(typed) : null;
  const invoice = useMemo<Invoice>(
    () => ({ ...link, amount: link.amount ?? typedAmount ?? 0n }),
    [link, typedAmount],
  );
  const amountReady = invoice.amount > 0n;
  const amountInvalid = openAmount && typed.trim() !== "" && typedAmount === null;
  const amount = fmt(invoice.amount, 6);

  const [evmWallets, setEvmWallets] = useState<EvmWallet[]>([]);
  const [solWallets, setSolWallets] = useState<SolanaWallet[]>([]);
  const [lane, setLane] = useState<Lane | null>(null);
  const [conn, setConn] = useState<Conn | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [states, setStates] = useState<Partial<Record<StepId, StationState>>>({});
  const [results, setResults] = useState<Partial<Record<StepId, StepResult>>>({});
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [feeBps, setFeeBps] = useState<number | null>(null);
  const [estimate, setEstimate] = useState<{ step: StepId; costWei: bigint } | null>(null);
  const actionRef = useRef<HTMLDivElement>(null);
  const routeRef = useRef<HTMLElement>(null);

  useEffect(() => listEvmWallets(setEvmWallets), []);
  useEffect(() => listSolanaWallets(CHAIN.solanaCluster, setSolWallets), []);
  useEffect(() => {
    readFeeBps().then(setFeeBps, () => setFeeBps(null));
  }, []);

  const evmWallet = pickEvmWallet(evmWallets);
  const solWallet = solWallets[0] ?? null;
  const walletName = lane === "evm" ? (evmWallet?.name ?? "MetaMask") : (solWallet?.name ?? "Solflare");

  const steps = lane ? LANE_STEPS[lane] : [];
  const nextStep = steps.find((id) => states[id] === "todo" || states[id] === "failed") ?? null;
  const paid = states.pay === "done";
  const running = busy !== null;

  const reset = useCallback(() => {
    setConn(null);
    setPlan(null);
    setStates({});
    setResults({});
    setError(null);
    setEstimate(null);
  }, []);

  const chooseLane = (next: Lane) => {
    if (running || next === lane) return;
    reset();
    setLane(next);
    // Phones: bring the stations into view so the payer sees every signature before the sticky button.
    if (window.matchMedia("(max-width: 859px)").matches) {
      const instant = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      requestAnimationFrame(() => routeRef.current?.scrollIntoView({ behavior: instant ? "auto" : "smooth", block: "start" }));
    }
  };

  // Drop the session when MetaMask switches account.
  useEffect(() => {
    if (conn?.lane !== "evm") return;
    const provider = conn.wallet.provider;
    const onAccounts = () => reset();
    provider.on?.("accountsChanged", onAccounts);
    return () => provider.removeListener?.("accountsChanged", onAccounts);
  }, [conn, reset]);

  const applyPlan = useCallback(
    (next: Plan) => {
      setPlan(next);
      setStates((prev) => {
        const out: Partial<Record<StepId, StationState>> = {};
        for (const id of LANE_STEPS[next.lane]) {
          out[id] = prev[id] === "done" ? "done" : next.needed[id] ? "todo" : "skip";
        }
        return out;
      });
    },
    [],
  );

  const plannedFor = useRef<bigint | null>(null);
  const inspect = useCallback(
    async (c: Conn) => {
      plannedFor.current = invoice.amount;
      setBusy("plan");
      setError(null);
      try {
        applyPlan(c.lane === "evm" ? await planEvm(c.address, invoice) : await planSolana(c.pubkey, invoice));
      } catch (err) {
        setError(`Could not read your balances. ${explainError(err, c.wallet.name)}`);
      } finally {
        setBusy(null);
      }
    },
    [applyPlan, invoice],
  );

  const connect = async () => {
    if (!lane || !amountReady) return;
    setBusy("connect");
    setError(null);
    try {
      let c: Conn;
      if (lane === "evm") {
        if (!evmWallet) return;
        const address = await connectEvm(evmWallet);
        await ensureEvmChain(evmWallet.provider);
        c = { lane, wallet: evmWallet, address };
      } else {
        if (!solWallet) return;
        const account = await connectSolana(solWallet);
        const signer = laneSigner(solWallet, account, CHAIN.solanaCluster);
        c = { lane, wallet: solWallet, pubkey: signer.payer, signer };
      }
      setConn(c);
      setBusy(null);
      await inspect(c);
    } catch (err) {
      setError(explainError(err, walletName));
    } finally {
      setBusy((b) => (b === "connect" ? null : b));
    }
  };

  const runStep = async () => {
    if (!conn || !plan || !nextStep) return;
    const step = nextStep;
    setError(null);
    setStates((prev) => ({ ...prev, [step]: "busy" }));
    setBusy({ step, phase: "wallet" });
    try {
      const result =
        conn.lane === "evm"
          ? await runEvmStep(conn.wallet.provider, step, plan, invoice, () => setBusy({ step, phase: "chain" }))
          : await runSolanaStep(conn.signer, conn.pubkey, step, plan, invoice);
      setResults((prev) => ({ ...prev, [step]: result }));
      setStates((prev) => ({ ...prev, [step]: "done" }));
    } catch (err) {
      setStates((prev) => ({ ...prev, [step]: "failed" }));
      setError(explainError(err, conn.wallet.name));
    } finally {
      setBusy(null);
    }
  };

  // Gas estimate for the next EVM station, shown before the payer signs.
  useEffect(() => {
    if (conn?.lane !== "evm" || !plan || !nextStep) return;
    let live = true;
    estimateStep(nextStep, plan, invoice).then((e) => {
      if (live) setEstimate(e ? { step: nextStep, costWei: e.costWei } : null);
    });
    return () => {
      live = false;
    };
  }, [conn, plan, nextStep, invoice]);

  useEffect(() => {
    if (paid) actionRef.current?.focus();
  }, [paid]);

  // Tell the server about the payment so the merchant sees it at once. The server reads the
  // receipt from Rome itself; a daily reconcile catches anything this misses.
  const payHash = results.pay?.hash;
  useEffect(() => {
    if (!paid || !payHash) return;
    let cancelled = false;
    (async () => {
      for (let attempt = 0; attempt < 4 && !cancelled; attempt++) {
        try {
          const res = await fetch("/api/payments", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ txHash: payHash }),
          });
          if (res.status !== 202 && res.status !== 502) return;
        } catch {
          // Offline or blocked: retry below.
        }
        await new Promise((resolve) => setTimeout(resolve, 3000 * (attempt + 1)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [paid, payHash]);

  // Balances are read once per inspection; a shortfall blocks the route until the payer adds funds and checks again.
  const anyDone = steps.some((id) => states[id] === "done");
  // Open amount edited after connecting: read the balances again for the new amount.
  useEffect(() => {
    if (!openAmount || !conn || !plan || anyDone || running || !amountReady) return;
    if (plannedFor.current === invoice.amount) return;
    const timer = setTimeout(() => inspect(conn), 500);
    return () => clearTimeout(timer);
  }, [openAmount, conn, plan, anyDone, running, amountReady, invoice.amount, inspect]);

  const fundsShort = plan?.shortfall && !paid && !anyDone ? plan.shortfall : null;

  // ------------------------------ the one big button ------------------------------
  let action: { label: string; onClick?: () => void; href?: string; disabled?: boolean; pending?: boolean };
  if (!lane) {
    action = { label: "Choose a wallet line above", disabled: true };
  } else if (!amountReady && !paid) {
    action = { label: "Enter the amount above", disabled: true };
  } else if (!conn) {
    const installed = lane === "evm" ? evmWallet : solWallet;
    action = installed
      ? { label: busy === "connect" ? `Confirm in ${installed.name}` : `Connect ${installed.name}`, onClick: connect, pending: busy === "connect" }
      : { label: `Install ${INSTALL[lane].name}`, href: INSTALL[lane].href };
  } else if (busy === "plan" || !plan) {
    action = { label: "Reading your balances", disabled: true, pending: true };
  } else if (paid) {
    action = { label: "View receipt on Via", href: txUrl(results.pay?.hash ?? "") };
  } else if (busy && typeof busy === "object") {
    action = { label: busy.phase === "wallet" ? `Confirm in ${conn.wallet.name}` : "Waiting for Rome to confirm", disabled: true, pending: true };
  } else if (fundsShort) {
    action = { label: "Check my balance again", onClick: () => inspect(conn) };
  } else if (nextStep) {
    action = { label: stepVerb(nextStep, amount, plan, states[nextStep] === "failed"), onClick: runStep };
  } else {
    action = { label: "Check my balance again", onClick: () => inspect(conn) };
  }

  const payer = conn ? (conn.lane === "evm" ? conn.address : plan?.payer) : null;
  const feeLabel = feeBps === null ? "…" : feeBps === 0 ? "0%" : `${(feeBps / 100).toFixed(2)}%`;
  const log = steps.filter((id) => results[id]?.hash || results[id]?.signature);

  return (
    <div className={s.page} data-lane={lane ?? undefined}>
      <header className={s.top}>
        <Link className={s.wordmark} href="/" aria-label="Rome Pay home">
          <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
            <circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" strokeWidth="4" />
            <rect x="2" y="13.5" width="28" height="5" fill="currentColor" />
          </svg>
          <span>Rome Pay</span>
        </Link>
        <span className={s.network}>
          {CHAIN.name}
          {CHAIN.testnet ? <em>Testnet</em> : null}
        </span>
      </header>

      <main className={s.main}>
        <section className={s.plate} aria-labelledby="merchant">
          <div className={s.plateHead}>
            <h1 id="merchant" className={s.merchant}>
              {invoice.merchant.name}
            </h1>
            <p className={s.memo}>
              {invoice.demo ? <span className={s.demoTag}>Demo invoice</span> : null}
              {invoice.memo}
            </p>
          </div>
          {openAmount ? (
            <div className={s.amountField}>
              <label className={s.amount}>
                <span className="visually-hidden">Amount in USDC</span>
                <input
                  className={s.amountInput}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0.00"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  readOnly={running || anyDone}
                  aria-invalid={amountInvalid || undefined}
                  aria-describedby="amount-hint"
                />
                <span className={s.amountUnit}>USDC</span>
              </label>
              <p id="amount-hint" className={amountInvalid ? s.amountError : s.amountHint}>
                {amountInvalid
                  ? "Enter an amount above 0 and up to 1,000,000, with at most 6 decimals."
                  : anyDone
                    ? "Amount locked: a station on this route is already cleared."
                    : "You choose the amount."}
              </p>
            </div>
          ) : (
            <p className={s.amount}>
              <span className={s.amountValue}>{amount}</span>
              <span className={s.amountUnit}>USDC</span>
            </p>
          )}
          <dl className={s.plateMeta}>
            <div>
              <dt>Paid to</dt>
              <dd>
                <a href={addressUrl(invoice.merchant.address)} target="_blank" rel="noreferrer">
                  {short(invoice.merchant.address)}
                </a>
              </dd>
            </div>
            <div>
              <dt>Reference</dt>
              <dd title={invoice.ref}>{short(invoice.ref)}</dd>
            </div>
            <div>
              <dt>Fee</dt>
              <dd>{feeLabel}</dd>
            </div>
          </dl>
        </section>

        <section className={s.lines} aria-labelledby="lines-title">
          <h2 id="lines-title" className={s.sectionTitle}>
            Pay with
          </h2>
          <div className={s.lineGrid} role="radiogroup" aria-labelledby="lines-title">
            <LineBadge
              lane="evm"
              selected={lane === "evm"}
              disabled={running}
              onSelect={chooseLane}
              title={evmWallet?.name ?? "MetaMask"}
              icon={evmWallet?.icon}
              detail="EVM wallet. Pays with USDC on Rome."
              status={evmWallet ? "Detected" : "Not installed"}
            />
            <LineBadge
              lane="solana"
              selected={lane === "solana"}
              disabled={running}
              onSelect={chooseLane}
              title={solWallet?.name ?? "Solflare"}
              icon={solWallet?.icon}
              detail="Solana wallet. Pays with USDC on Solana devnet."
              status={solWallet ? "Detected" : "Not installed"}
            />
          </div>
          {lane === "solana" && solWallet && isKnownV1Gap(solWallet) ? (
            <p className={s.notice} role="note">
              {solWallet.name} cannot sign Rome&apos;s Solana transactions yet. Use Solflare for this line.
            </p>
          ) : null}
        </section>

        <section className={s.route} aria-labelledby="route-title" ref={routeRef}>
          <h2 id="route-title" className="visually-hidden">
            Payment route
          </h2>
          {lane ? (
            <RouteMap
              lane={lane}
              steps={steps}
              states={conn ? states : {}}
              results={results}
              amount={amount}
              merchant={invoice.merchant.name}
              merchantAddress={short(invoice.merchant.address)}
              feeLabel={feeLabel}
              fundAmount={plan ? fmt(plan.fundUnits, 6) : null}
              arrived={paid}
            />
          ) : (
            <Schematic merchant={invoice.merchant.name} />
          )}
        </section>

        <div className={s.action} ref={actionRef} tabIndex={-1} aria-live="polite">
          {paid ? (
            <p className={s.arrival}>
              Paid. {invoice.merchant.name} received {amount} USDC.
            </p>
          ) : null}
          {action.href ? (
            <a className={s.go} href={action.href} target="_blank" rel="noreferrer">
              {action.label}
              <Arrow />
            </a>
          ) : (
            <button className={s.go} type="button" onClick={action.onClick} disabled={action.disabled} aria-busy={action.pending || undefined}>
              {action.pending ? <span className={s.spinner} aria-hidden="true" /> : null}
              {action.label}
              {action.pending || action.disabled ? null : <Arrow />}
            </button>
          )}
          {error ? (
            <p className={s.error} role="alert">
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
                <path d="M3 13 13 3" stroke="currentColor" strokeWidth="2" />
              </svg>
              {error}
            </p>
          ) : null}
          {fundsShort ? (
            <div className={s.funding}>
              <p>
                You need {fundsShort.need} {fundsShort.asset} and have {fundsShort.have}. Add test funds, then check again.
              </p>
              <p className={s.fundingLinks}>
                <a href={FUNDING_LINKS.faucet} target="_blank" rel="noreferrer">
                  Circle faucet
                </a>
                <a href={FUNDING_LINKS.bridge} target="_blank" rel="noreferrer">
                  Rome bridge
                </a>
              </p>
            </div>
          ) : null}
        </div>

        <section className={s.readout} aria-labelledby="readout-title">
          <h2 id="readout-title" className={s.sectionTitle}>
            Live readout
          </h2>
          <dl className={s.readoutGrid}>
            <Row label="Amount" value={`${amount} USDC`} />
            <Row
              label="Payer"
              value={payer ? short(payer) : "Not connected"}
              href={payer ? addressUrl(payer) : undefined}
              placeholder={!payer}
            />
            {plan?.balances.map((b) => <Row key={b.label} label={b.label} value={`${fmt(b.value, b.decimals)} ${b.unit}`} />)}
            {conn?.lane === "evm" && nextStep && !paid ? (
              <Row
                label="Next gas"
                value={estimate?.step === nextStep ? `~${fmt(estimate.costWei, 18, 6)} USDC` : "Estimating when ready"}
                placeholder={estimate?.step !== nextStep}
              />
            ) : null}
          </dl>
          {log.length ? (
            <ol className={s.log}>
              {log.map((id) => {
                const r = results[id]!;
                const href = r.hash ? txUrl(r.hash) : `https://explorer.solana.com/tx/${r.signature}?cluster=devnet`;
                return (
                  <li key={id}>
                    <span>{PLATE_NAME[id]}</span>
                    <a href={href} target="_blank" rel="noreferrer">
                      {short(r.hash ?? r.signature ?? "", 10, 6)}
                    </a>
                  </li>
                );
              })}
            </ol>
          ) : null}
        </section>
      </main>

      <footer className={s.foot}>
        <p>
          Non-custodial. Your wallet signs every station. PayRouter moves the USDC from your wallet to the merchant in the same
          transaction
          {feeBps === 0 ? " and keeps nothing." : feeBps ? `, minus a ${feeLabel} fee shown above.` : "."}
        </p>
        <p className={s.footLinks}>
          <a href={addressUrl(CHAIN.payRouter)} target="_blank" rel="noreferrer">
            PayRouter {short(CHAIN.payRouter)}
          </a>
          <a href="https://www.rome.builders/" target="_blank" rel="noreferrer">
            Built on Rome
          </a>
        </p>
      </footer>
    </div>
  );
}

const PLATE_NAME: Record<StepId, string> = {
  provision: "Account",
  wrap: "Wrap",
  fund: "Fund",
  grant: "Grant",
  approve: "Approve",
  pay: "PayRouter",
};

function stepVerb(step: StepId, amount: string, plan: Plan, retry: boolean): string {
  const verb = (() => {
    switch (step) {
      case "provision":
        return "Open Rome account";
      case "wrap":
        return `Wrap ${fmt(plan.wrapWei, 18)} USDC`;
      case "fund":
        return `Move ${fmt(plan.fundUnits, 6)} USDC to Rome`;
      case "grant":
        return "Grant wUSDC access";
      case "approve":
        return `Approve ${amount} wUSDC`;
      case "pay":
        return `Pay ${amount} USDC`;
    }
  })();
  return retry ? `Retry: ${verb}` : verb;
}

function LineBadge(props: {
  lane: Lane;
  selected: boolean;
  disabled: boolean;
  onSelect: (lane: Lane) => void;
  title: string;
  icon?: string;
  detail: string;
  status: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={props.selected}
      disabled={props.disabled && !props.selected}
      className={s.badge}
      data-line={props.lane}
      onClick={() => props.onSelect(props.lane)}
    >
      <span className={s.badgeBullet} aria-hidden="true">
        {/* Wallet-provided data URI icon; next/image adds nothing here. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {props.icon ? <img src={props.icon} alt="" width="24" height="24" /> : null}
      </span>
      <span className={s.badgeText}>
        <span className={s.badgeTitle}>{props.title} line</span>
        <span className={s.badgeDetail}>{props.detail}</span>
      </span>
      <span className={s.badgeStatus}>{props.status}</span>
    </button>
  );
}

function Row({ label, value, href, placeholder }: { label: string; value: string; href?: string; placeholder?: boolean }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={placeholder ? s.placeholder : undefined}>
        {href ? (
          <a href={href} target="_blank" rel="noreferrer">
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

function Arrow() {
  return (
    <svg className={s.arrow} viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
      <path d="M3 10h13M11 5l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
    </svg>
  );
}
