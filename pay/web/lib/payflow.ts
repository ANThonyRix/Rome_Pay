// Dual-lane payment flow for PayRouter. Both lanes pay the same contract with
// the same wUSDC wrapper. Every write goes through the Rome SDK: submitRomeTx
// on the EVM lane, submitRomeTxV1 on the Solana lane (Rome AGENTS.md rule 1).
// Reads are plain viem / @solana/web3.js.
import {
  buildCreatePdaCall,
  buildFundLeg,
  buildSweepLeg,
  isSyntheticProvisioned,
  submitRomeTx,
  submitRomeTxV1,
  submitSolanaInstructionsV1,
  syntheticAddress,
  type SignerLike,
} from "@/vendor/rome-sdk";
import { Connection, PublicKey } from "@solana/web3.js";
import { createPublicClient, encodeFunctionData, erc20Abi, http, parseAbi, type Hex } from "viem";
import { CHAIN } from "./chain";
import { fmt } from "./format";
import type { Invoice } from "./invoices";

export type Lane = "evm" | "solana";
export type StepId = "wrap" | "provision" | "fund" | "grant" | "approve" | "pay";

export const PAY_ROUTER_ABI = parseAbi([
  "function pay(address merchant, uint256 amount, bytes32 ref)",
  "function feeBps() view returns (uint16)",
]);
const WITHDRAW = "0x4200000000000000000000000000000000000016" as const;
const WITHDRAW_ABI = parseAbi(["function withdraw_to_ata(uint256 wei_)"]);
const HELPER = "0xff00000000000000000000000000000000000009" as const;
const GRANT_ABI = parseAbi(["function approve_spl(address spender, uint64 amount, bytes32 mint)"]);
const WRAPPER_ABI = parseAbi([
  "function isEnabled(address user) view returns (bool)",
  "function mint_id() view returns (bytes32)",
]);
const U64_MAX = 2n ** 64n - 1n;
/** 1 wUSDC base unit (6 dec) = 1e12 wei of gas USDC (18 dec). */
const WEI_PER_UNIT = 10n ** 12n;

/** Station order per lane. The Solana order follows create-rome-app: v1 calls run before any USDC moves. */
export const LANE_STEPS: Record<Lane, StepId[]> = {
  evm: ["wrap", "grant", "approve", "pay"],
  solana: ["provision", "approve", "fund", "grant", "pay"],
};

export const publicClient = createPublicClient({ transport: http(CHAIN.rpcUrl) });
const connection = () => new Connection(CHAIN.solanaRpc, "confirmed");

export interface Eip1193 {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
}

/** What the payer has to do, found by reads before anything is signed. */
export interface Plan {
  lane: Lane;
  payer: Hex; // EVM address that calls PayRouter (MetaMask account, or the Solana user's synthetic)
  needed: Record<StepId, boolean>;
  wrapWei: bigint; // EVM lane: gas USDC to wrap into wUSDC
  fundUnits: bigint; // Solana lane: USDC to move from the wallet into the synthetic
  shortfall: { asset: string; have: string; need: string } | null;
  balances: { label: string; value: bigint; decimals: number; unit: string }[];
}

export interface StepResult {
  hash?: Hex;
  signature?: string;
}

async function wrapperGrantCall(who: Hex): Promise<{ to: Hex; data: Hex } | null> {
  const enabled = await publicClient.readContract({ address: CHAIN.wusdc, abi: WRAPPER_ABI, functionName: "isEnabled", args: [who] });
  if (enabled) return null;
  const mint = await publicClient.readContract({ address: CHAIN.wusdc, abi: WRAPPER_ABI, functionName: "mint_id" });
  return { to: HELPER, data: encodeFunctionData({ abi: GRANT_ABI, functionName: "approve_spl", args: [CHAIN.wusdc, U64_MAX, mint] }) };
}

export function stepCall(step: StepId, plan: Plan, invoice: Invoice): { to: Hex; data: Hex } | null {
  switch (step) {
    case "wrap":
      return { to: WITHDRAW, data: encodeFunctionData({ abi: WITHDRAW_ABI, functionName: "withdraw_to_ata", args: [plan.wrapWei] }) };
    case "approve":
      return { to: CHAIN.wusdc, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [CHAIN.payRouter, invoice.amount] }) };
    case "pay":
      return {
        to: CHAIN.payRouter,
        data: encodeFunctionData({ abi: PAY_ROUTER_ABI, functionName: "pay", args: [invoice.merchant.address, invoice.amount, invoice.ref] }),
      };
    case "provision": {
      const pda = buildCreatePdaCall(plan.payer);
      return { to: pda.to, data: pda.data ?? "0x" };
    }
    default:
      return null; // grant needs a read first; fund is a plain Solana transaction
  }
}

export const readWusdc = (who: Hex) => publicClient.readContract({ address: CHAIN.wusdc, abi: erc20Abi, functionName: "balanceOf", args: [who] });
const readAllowance = (who: Hex) =>
  publicClient.readContract({ address: CHAIN.wusdc, abi: erc20Abi, functionName: "allowance", args: [who, CHAIN.payRouter] });
const readEnabled = (who: Hex) => publicClient.readContract({ address: CHAIN.wusdc, abi: WRAPPER_ABI, functionName: "isEnabled", args: [who] });

export async function readFeeBps(): Promise<number> {
  return publicClient.readContract({ address: CHAIN.payRouter, abi: PAY_ROUTER_ABI, functionName: "feeBps" });
}

// ------------------------------ EVM lane (MetaMask) ------------------------------

export async function planEvm(address: Hex, invoice: Invoice): Promise<Plan> {
  const [wusdc, native, allowance, enabled] = await Promise.all([
    readWusdc(address),
    publicClient.getBalance({ address }),
    readAllowance(address),
    readEnabled(address),
  ]);
  const missing = wusdc >= invoice.amount ? 0n : invoice.amount - wusdc;
  const wrapWei = missing * WEI_PER_UNIT;
  // Gas USDC must cover the wrap itself plus a little for the fees of the later steps.
  const reserve = 50_000_000_000_000_000n; // 0.05 USDC
  const shortfall =
    native < wrapWei + reserve
      ? { asset: "USDC (gas)", have: fmt(native, 18), need: fmt(wrapWei + reserve, 18) }
      : null;
  return {
    lane: "evm",
    payer: address,
    needed: { wrap: missing > 0n, provision: false, fund: false, grant: !enabled, approve: allowance < invoice.amount, pay: true },
    wrapWei,
    fundUnits: 0n,
    shortfall,
    balances: [
      { label: "Gas USDC", value: native, decimals: 18, unit: "USDC" },
      { label: "wUSDC", value: wusdc, decimals: 6, unit: "wUSDC" },
    ],
  };
}

export async function ensureEvmChain(provider: Eip1193) {
  const want = `0x${CHAIN.chainId.toString(16)}`;
  const current = (await provider.request({ method: "eth_chainId" })) as string;
  if (current?.toLowerCase() === want) return;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: want }] });
  } catch (err) {
    if ((err as { code?: number })?.code !== 4902) throw err;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: want,
          chainName: CHAIN.name,
          nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
          rpcUrls: [CHAIN.rpcUrl],
          blockExplorerUrls: [CHAIN.explorerUrl],
        },
      ],
    });
  }
}

export async function runEvmStep(
  provider: Eip1193,
  step: StepId,
  plan: Plan,
  invoice: Invoice,
  onSubmitted?: (hash: Hex) => void,
): Promise<StepResult> {
  await ensureEvmChain(provider);
  const call = step === "grant" ? await wrapperGrantCall(plan.payer) : stepCall(step, plan, invoice);
  if (!call) return {};
  const hash = await submitRomeTx(provider, { from: plan.payer, ...call });
  onSubmitted?.(hash);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new StepFailed(step, "the transaction reverted", hash);
  return { hash };
}

// ------------------------------ Solana lane (Solflare) ------------------------------

export async function planSolana(wallet: PublicKey, invoice: Invoice): Promise<Plan> {
  const synthetic = syntheticAddress(wallet);
  const conn = connection();
  const [provisioned, allowance, inSynthetic, enabled, lamports, tokenAccounts] = await Promise.all([
    isSyntheticProvisioned(conn, CHAIN.programId, synthetic),
    readAllowance(synthetic),
    readWusdc(synthetic),
    readEnabled(synthetic),
    conn.getBalance(wallet),
    conn.getParsedTokenAccountsByOwner(wallet, { mint: new PublicKey(CHAIN.usdcMint) }),
  ]);
  const walletUsdc = tokenAccounts.value.reduce(
    (sum, acc) => sum + BigInt(acc.account.data.parsed.info.tokenAmount.amount as string),
    0n,
  );
  const fundUnits = inSynthetic >= invoice.amount ? 0n : invoice.amount - inSynthetic;
  const minLamports = 10_000_000; // 0.01 SOL for Solana transaction fees
  const shortfall =
    walletUsdc < fundUnits
      ? { asset: "USDC", have: fmt(walletUsdc, 6), need: fmt(fundUnits, 6) }
      : lamports < minLamports
        ? { asset: "SOL (fees)", have: fmt(BigInt(lamports), 9), need: fmt(BigInt(minLamports), 9) }
        : null;
  return {
    lane: "solana",
    payer: synthetic,
    needed: { wrap: false, provision: !provisioned, approve: allowance < invoice.amount, fund: fundUnits > 0n, grant: !enabled, pay: true },
    wrapWei: 0n,
    fundUnits,
    shortfall,
    balances: [
      { label: "USDC in wallet", value: walletUsdc, decimals: 6, unit: "USDC" },
      { label: "SOL", value: BigInt(lamports), decimals: 9, unit: "SOL" },
      { label: "On Rome", value: inSynthetic, decimals: 6, unit: "wUSDC" },
    ],
  };
}

export async function runSolanaStep(signer: SignerLike, wallet: PublicKey, step: StepId, plan: Plan, invoice: Invoice): Promise<StepResult> {
  const conn = connection();
  if (step === "fund") {
    const ixs = buildFundLeg({
      programId: CHAIN.programId,
      chainId: CHAIN.chainId,
      mint: new PublicKey(CHAIN.usdcMint),
      amount: plan.fundUnits,
      wallet,
      synthetic: plan.payer,
    });
    const { signature } = await submitSolanaInstructionsV1(ixs, { connection: conn, signer });
    return { signature };
  }
  const call = step === "grant" ? await wrapperGrantCall(plan.payer) : stepCall(step, plan, invoice);
  if (!call) return {};
  const result = await submitRomeTxV1(
    { connection: conn, proxyUrl: CHAIN.rpcUrl, chainId: CHAIN.chainId, programId: CHAIN.programId, signer },
    call,
  );
  // A relayed call that reverts does not throw; a missing receipt is not a success either.
  if (result.receipt?.status !== "0x1") {
    throw new StepFailed(step, result.receipt ? "the transaction reverted" : "no receipt arrived in time", result.hash);
  }
  return { hash: result.hash, signature: result.signature };
}

// ------------------------------ Solana merchant withdraw ------------------------------

export type WithdrawStep = "provision" | "account" | "move";

/**
 * Moves a Solana merchant's whole wUSDC balance from its Rome synthetic to its Solflare wallet:
 * create the synthetic's PDA once, create the wallet's USDC account if missing, then
 * HelperProgram.transfer_spl (the SDK's sweep leg). Each step reports itself before it asks the wallet.
 */
export async function runWithdraw(
  signer: SignerLike,
  wallet: PublicKey,
  onStep: (step: WithdrawStep) => void,
): Promise<{ hash: Hex; amount: bigint }> {
  const conn = connection();
  const synthetic = syntheticAddress(wallet);
  const amount = await readWusdc(synthetic);
  if (amount === 0n) throw new Error("There is nothing to move yet.");
  const deps = { connection: conn, proxyUrl: CHAIN.rpcUrl, chainId: CHAIN.chainId, programId: CHAIN.programId, signer };

  if (!(await isSyntheticProvisioned(conn, CHAIN.programId, synthetic))) {
    onStep("provision");
    const created = await submitRomeTxV1(deps, buildCreatePdaCall(synthetic));
    if (created.receipt?.status !== "0x1") throw new StepFailed("provision", "the account setup did not confirm", created.hash);
  }

  const leg = buildSweepLeg({ programId: CHAIN.programId, mint: new PublicKey(CHAIN.usdcMint), amount, wallet, synthetic });
  const walletAta = leg.extraAccounts[0].pubkey;
  if (!(await conn.getAccountInfo(walletAta))) {
    onStep("account");
    await submitSolanaInstructionsV1([leg.ensureWalletAtaIx], { connection: conn, signer });
  }

  onStep("move");
  const moved = await submitRomeTxV1(deps, { to: leg.helperTo, data: leg.calldata });
  if (moved.receipt?.status !== "0x1") {
    throw new StepFailed("pay", moved.receipt ? "the transfer reverted" : "no receipt arrived in time", moved.hash);
  }
  return { hash: moved.hash, amount };
}

// ------------------------------ helpers ------------------------------

export class StepFailed extends Error {
  constructor(
    readonly step: StepId,
    readonly reason: string,
    readonly hash?: Hex,
  ) {
    super(`${step}: ${reason}`);
  }
}

/** Gas estimate for a step from the payer's address, or null when the node cannot simulate it yet. */
export async function estimateStep(step: StepId, plan: Plan, invoice: Invoice): Promise<{ gas: bigint; costWei: bigint } | null> {
  if (step === "fund") return null;
  try {
    const call = step === "grant" ? await wrapperGrantCall(plan.payer) : stepCall(step, plan, invoice);
    if (!call) return null;
    const [gas, price] = await Promise.all([
      publicClient.estimateGas({ account: plan.payer, to: call.to, data: call.data }),
      publicClient.getGasPrice(),
    ]);
    return { gas, costWei: gas * price };
  } catch {
    return null;
  }
}

/** Map wallet and node errors to a sentence a payer can act on. */
/**
 * Only the wallet's own "the user said no" answer counts as a decline. A loose /reject/ match
 * also caught wallet and chain failures ("... Rome would reject it") and hid the real reason.
 */
export function isUserRejection(err: unknown): boolean {
  const e = err as { code?: number; name?: string; message?: string; shortMessage?: string };
  if (e?.code === 4001 || e?.name === "UserRejectedRequestError") return true;
  const msg = `${e?.shortMessage ?? ""} ${e?.message ?? ""}`;
  return /user (rejected|denied|declined|cancell?ed|closed)|rejected the request|request (was )?(rejected|cancell?ed)|cancell?ed by (the )?user/i.test(msg);
}

export function explainError(err: unknown, walletName: string): string {
  const e = err as { code?: number; message?: string; shortMessage?: string; reason?: string };
  const msg = `${e?.shortMessage ?? ""} ${e?.message ?? ""}`;
  if (isUserRejection(err)) {
    return `You declined in ${walletName}. Nothing was sent. Continue when you are ready.`;
  }
  if (err instanceof StepFailed) return `This step did not go through: ${err.reason}. No payment was made. Try the step again.`;
  if (/0x4\b|owner does not match|custom program error: 0x4/i.test(msg)) {
    return "The wUSDC wrapper is not allowed to move your tokens yet. Run the Grant step again.";
  }
  if (/insufficient/i.test(msg)) return "Your balance is too low for this step. Add funds and try again.";
  if (/timeout|timed out|fetch failed|network/i.test(msg)) return "The network did not answer in time. Your funds are safe. Try the step again.";
  return `${walletName} or the network stopped this step: ${(e?.shortMessage ?? e?.message ?? String(err)).slice(0, 280)}`;
}
