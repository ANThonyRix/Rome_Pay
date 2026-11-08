// Wallet discovery without wallet-specific SDKs.
// EVM lane: EIP-6963 announcements (falls back to window.ethereum).
// Solana lane: Wallet Standard; a wallet needs standard:connect,
// solana:signMessage and solana:signTransaction (v1) on the cluster.
// Adapted from create-rome-app template/lib/solanaWallet.ts (MIT).
import { getWallets } from "@wallet-standard/app";
import { PublicKey } from "@solana/web3.js";
import { ed25519 } from "@noble/curves/ed25519";
import { parseV1Message, splitV1Wire, walletAddedPriorityFee, type LaneSigner, type ParsedV1Message } from "@/vendor/rome-sdk";
import type { Eip1193 } from "./payflow";

// ------------------------------ EVM (EIP-6963) ------------------------------

export interface EvmWallet {
  name: string;
  icon: string; // data URI provided by the wallet
  rdns: string;
  provider: Eip1193;
}

interface Eip6963Detail {
  info: { name: string; icon: string; rdns: string; uuid: string };
  provider: Eip1193;
}

/** Collect EIP-6963 wallets; calls onChange as wallets announce themselves. */
export function listEvmWallets(onChange: (wallets: EvmWallet[]) => void): () => void {
  const found = new Map<string, EvmWallet>();
  const emit = () => onChange([...found.values()]);
  const onAnnounce = (event: Event) => {
    const { info, provider } = (event as CustomEvent<Eip6963Detail>).detail;
    found.set(info.rdns || info.uuid, { name: info.name, icon: info.icon, rdns: info.rdns, provider });
    emit();
  };
  window.addEventListener("eip6963:announceProvider", onAnnounce);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  // Legacy injection: only used when no wallet speaks EIP-6963.
  const legacy = window.setTimeout(() => {
    const injected = (window as unknown as { ethereum?: Eip1193 & { isMetaMask?: boolean } }).ethereum;
    if (found.size === 0 && injected) {
      found.set("injected", { name: injected.isMetaMask ? "MetaMask" : "Browser wallet", icon: "", rdns: "injected", provider: injected });
      emit();
    }
  }, 400);
  return () => {
    window.removeEventListener("eip6963:announceProvider", onAnnounce);
    window.clearTimeout(legacy);
  };
}

/** MetaMask first, then any other EVM wallet. */
export const pickEvmWallet = (wallets: EvmWallet[]) => wallets.find((w) => w.rdns === "io.metamask") ?? wallets[0] ?? null;

/** All EVM wallets, MetaMask first. The same address signs in to the same dashboard in any of them. */
export const sortEvmWallets = (wallets: EvmWallet[]) =>
  [...wallets].sort((a, b) => Number(b.rdns === "io.metamask") - Number(a.rdns === "io.metamask"));

export async function connectEvm(wallet: EvmWallet): Promise<`0x${string}`> {
  const accounts = (await wallet.provider.request({ method: "eth_requestAccounts" })) as string[];
  const [account] = accounts ?? [];
  if (!account) throw new Error(`${wallet.name} returned no account. Unlock it and try again.`);
  return account.toLowerCase() as `0x${string}`;
}

// ------------------------------ Solana (Wallet Standard) ------------------------------

export type SolanaWallet = ReturnType<ReturnType<typeof getWallets>["get"]>[number];
export type SolanaAccount = SolanaWallet["accounts"][number];

export const solanaChainId = (cluster: string) => (/^mainnet/.test(cluster) ? "solana:mainnet" : "solana:devnet");

const REQUIRED = ["standard:connect", "solana:signMessage", "solana:signTransaction"];
const usable = (w: SolanaWallet, chain: string) =>
  REQUIRED.every((f) => f in w.features) && (w.chains as readonly string[]).includes(chain);

/** Solana wallets that can drive the lane on this cluster. Solflare is sorted first. */
export function listSolanaWallets(cluster: string, onChange: (wallets: SolanaWallet[]) => void): () => void {
  const chain = solanaChainId(cluster);
  const { get, on } = getWallets();
  const emit = () =>
    onChange(
      get()
        .filter((w) => usable(w, chain))
        .sort((a, b) => Number(/solflare/i.test(b.name)) - Number(/solflare/i.test(a.name))),
    );
  emit();
  const offs = [on("register", emit), on("unregister", emit)];
  return () => offs.forEach((off) => off());
}

const SIGNED_IN_WALLET = "rp_solana_wallet";

/** Remember which Solana wallet opened the dashboard, so Withdraw asks the same one. */
export function rememberSolanaWallet(name: string) {
  try {
    localStorage.setItem(SIGNED_IN_WALLET, name);
  } catch {
    // storage blocked: Withdraw falls back to the first wallet
  }
}

/** The wallet the merchant signed in with, else the first one listed. */
export function preferredSolanaWallet(wallets: SolanaWallet[]): SolanaWallet | null {
  let name: string | null = null;
  try {
    name = localStorage.getItem(SIGNED_IN_WALLET);
  } catch {
    // storage blocked
  }
  return wallets.find((w) => w.name === name) ?? wallets[0] ?? null;
}

/** Phantom does not sign Solana v1 transactions on devnet; warn before the payer starts. */
export const isKnownV1Gap = (wallet: SolanaWallet) => /phantom/i.test(wallet.name);

type Features = Record<string, Record<string, (input: unknown) => Promise<unknown>>>;

export async function connectSolana(wallet: SolanaWallet): Promise<SolanaAccount> {
  const features = wallet.features as unknown as Features;
  const { accounts } = (await features["standard:connect"].connect({})) as { accounts: SolanaAccount[] };
  const [account] = accounts ?? [];
  if (!account) throw new Error(`${wallet.name} returned no account. Unlock it and try again.`);
  return account;
}

/** Signs a plain text message (dashboard sign-in). Fails if the wallet signed different bytes. */
export async function signSolanaText(wallet: SolanaWallet, account: SolanaAccount, text: string): Promise<Uint8Array> {
  const features = wallet.features as unknown as Features;
  const message = new TextEncoder().encode(text);
  const [{ signature, signedMessage }] = (await features["solana:signMessage"].signMessage({ account, message })) as {
    signature: Uint8Array;
    signedMessage?: Uint8Array;
  }[];
  if (signedMessage && (signedMessage.length !== message.length || signedMessage.some((b, i) => b !== message[i]))) {
    throw new Error(`${wallet.name} changed the sign-in message before signing it.`);
  }
  return new Uint8Array(signature);
}

export function laneSigner(wallet: SolanaWallet, account: SolanaAccount, cluster: string): LaneSigner {
  const features = wallet.features as unknown as Features;
  const chain = solanaChainId(cluster);
  const signWire = async (wire: Uint8Array) => {
    const [{ signedTransaction }] = (await features["solana:signTransaction"].signTransaction({ account, transaction: wire, chain })) as {
      signedTransaction: Uint8Array;
    }[];
    return new Uint8Array(signedTransaction);
  };
  const payer = account.publicKey as Uint8Array;
  return {
    payer: new PublicKey(account.publicKey),
    signAuthHash: async (message: Uint8Array) => {
      const [{ signature, signedMessage }] = (await features["solana:signMessage"].signMessage({ account, message })) as {
        signature: Uint8Array;
        signedMessage?: Uint8Array;
      }[];
      // Rome checks the exact bytes; a wallet that rewrites the message would fail later with a vague error.
      if (signedMessage && (signedMessage.length !== message.length || signedMessage.some((b, i) => b !== message[i]))) {
        throw new Error(`${wallet.name} changed the authorization message before signing it.`);
      }
      return signature;
    },
    signV1Wire: async (wire: Uint8Array) => pickV1Signature(wallet.name, wire, await signWire(wire), payer),
    // Used by the SDK instead of signV1Wire: Solflare adds its own priority fee to the v1
    // message before signing, so the SDK needs the message that was actually signed.
    signV1WireWithMessage: async (wire: Uint8Array) => readSignedV1(wallet.name, wire, await signWire(wire), payer),
  };
}

/**
 * The message the wallet signed and its signature. Either our composed message, or the
 * wallet's copy with only a priority fee added (the SDK checks that again and caps the fee).
 */
function readSignedV1(walletName: string, wire: Uint8Array, signed: Uint8Array, payer: Uint8Array) {
  const { message } = splitV1Wire(wire);
  try {
    return { message, signature: pickV1Signature(walletName, wire, signed, payer) };
  } catch (err) {
    // Two layouts: signature last (v1 wire), or a one-byte count and the signature first.
    const layouts: [Uint8Array, Uint8Array][] = [];
    if (signed[0] === V1_VERSION && signed.length > SIG) layouts.push([signed.slice(0, -SIG), signed.slice(-SIG)]);
    if (signed[0] === 1 && signed[1 + SIG] === V1_VERSION) layouts.push([signed.slice(1 + SIG), signed.slice(1, 1 + SIG)]);
    const notes: string[] = [];
    for (const [walletMessage, signature] of layouts) {
      const feeOnly = walletAddedPriorityFee(message, walletMessage) !== null;
      const sigOk = ed25519.verify(signature, walletMessage, payer);
      if (feeOnly && sigOk) return { message: walletMessage, signature };
      notes.push(`${feeOnly ? "fee-only" : explainFeeMismatch(message, walletMessage)}, signature over it ${sigOk ? "valid" : "invalid"}`);
    }
    throw new Error(`${(err as Error).message} Detail: ${notes.join(" | ") || "no v1 layout found"}.`);
  }
}

/** Where the wallet's message stops matching "ours plus an inserted priority fee". */
function explainFeeMismatch(composed: Uint8Array, signed: Uint8Array): string {
  const u32 = (b: Uint8Array) => (b.length >= 8 ? new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(4, true) : -1);
  const head = `mask 0x${u32(composed).toString(16)} -> 0x${u32(signed).toString(16)}, sizes ${composed.length}/${signed.length}`;
  if (composed.length < 42 || signed.length !== composed.length + 8) return head;
  const at = 42 + 32 * composed[41]!;
  const region = (i: number) => (i < 4 ? "header" : i < 40 ? "blockhash" : i < 42 ? "counts" : i < at ? `account ${Math.floor((i - 42) / 32)}` : "after fee");
  for (let i = 0; i < at; i++) {
    if ((i < 4 || i >= 8) && signed[i] !== composed[i]) {
      return `${head}, first diff at byte ${i} (${region(i)}): 0x${composed[i]!.toString(16)} -> 0x${signed[i]!.toString(16)}`;
    }
  }
  for (let i = at; i < composed.length; i++) {
    if (signed[i + 8] !== composed[i]) {
      return `${head}, first diff at byte ${i} (${region(i)}, ${i - at} after keys): 0x${composed[i]!.toString(16)} -> 0x${signed[i + 8]!.toString(16)}`;
    }
  }
  return `${head}, bytes match`;
}

const SIG = 64;
const V1_VERSION = 0x81;

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/**
 * Name what a wallet changed in a v1 message, so a failed signature can be diagnosed from
 * one screenshot. Tries the two wire layouts wallets return (signature last, or count +
 * signature first) and diffs the decoded message against the one we composed.
 */
function describeRewrite(composed: Uint8Array, signed: Uint8Array): string {
  const candidates: Uint8Array[] = [];
  if (signed[0] === V1_VERSION && signed.length > SIG) candidates.push(signed.subarray(0, signed.length - SIG));
  if (signed[1 + SIG] === V1_VERSION) candidates.push(signed.subarray(1 + SIG));
  const base = `returned ${signed.length} bytes (version byte 0x${(signed[0] ?? 0).toString(16)}), composed ${composed.length + SIG}`;

  let before: ParsedV1Message;
  try {
    before = parseV1Message(composed);
  } catch {
    return base;
  }
  for (const candidate of candidates) {
    let after: ParsedV1Message;
    try {
      after = parseV1Message(candidate);
    } catch {
      continue;
    }
    const diff: string[] = [];
    if (hex(composed.subarray(8, 40)) !== hex(candidate.subarray(8, 40))) diff.push("recent blockhash replaced");
    if (before.priorityFeeMicroLamports !== after.priorityFeeMicroLamports) {
      diff.push(`priority fee ${before.priorityFeeMicroLamports ?? "none"} -> ${after.priorityFeeMicroLamports ?? "none"}`);
    }
    if (before.computeUnitLimit !== after.computeUnitLimit) {
      diff.push(`compute limit ${before.computeUnitLimit ?? "none"} -> ${after.computeUnitLimit ?? "none"}`);
    }
    if (before.heapBytes !== after.heapBytes) diff.push(`heap ${before.heapBytes ?? "none"} -> ${after.heapBytes ?? "none"}`);
    if (before.instructions.length !== after.instructions.length) {
      diff.push(`instructions ${before.instructions.length} -> ${after.instructions.length}`);
    }
    if (before.accountKeys.length !== after.accountKeys.length) {
      diff.push(`accounts ${before.accountKeys.length} -> ${after.accountKeys.length}`);
    }
    const sameIx =
      before.instructions.length === after.instructions.length &&
      before.instructions.every((ix, i) => hex(ix.data) === hex(after.instructions[i]!.data));
    if (!sameIx && before.instructions.length === after.instructions.length) diff.push("instruction data changed");
    return `${diff.length ? diff.join(", ") : "no field-level difference found"}; ${base}`;
  }
  return `${signed[0] === V1_VERSION ? "unreadable v1 message" : "not returned as a v1 transaction"}; ${base}`;
}

const indexOf = (hay: Uint8Array, needle: Uint8Array) => {
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
};

/**
 * Wallets do not agree on how they return a signed v1 wire: the v1 layout puts the
 * signature after the message, but some wallets re-serialize with the signature
 * first (compact count, then signature, then message). Find the 64 bytes that
 * verify over the message we composed instead of trusting one layout.
 */
function pickV1Signature(walletName: string, wire: Uint8Array, signed: Uint8Array, payer: Uint8Array): Uint8Array {
  const { message } = splitV1Wire(wire);
  const verifies = (at: number) =>
    at >= 0 && at + SIG <= signed.length && ed25519.verify(signed.subarray(at, at + SIG), message, payer);

  // Known layouts first: signature last (v1), signature after a one-byte count, signature first.
  const at = [signed.length - SIG, 1, 0].find(verifies);
  if (at !== undefined) return signed.slice(at, at + SIG);

  const msgAt = indexOf(signed, message);
  if (msgAt >= 0) {
    for (const cand of [msgAt + message.length, msgAt - SIG]) if (verifies(cand)) return signed.slice(cand, cand + SIG);
  }
  console.debug("[rome-pay] v1 signature not found", {
    wallet: walletName,
    composedBytes: wire.length,
    returnedBytes: signed.length,
    returnedVersionByte: signed[0],
    messageFoundAt: msgAt,
  });
  if (msgAt < 0) {
    const changes = describeRewrite(message, signed);
    console.debug("[rome-pay] wallet rewrite", { wallet: walletName, changes });
    throw new Error(
      `${walletName} changed the transaction before signing it, so Rome cannot accept it. What changed: ${changes}. Turn off any transaction "protection" or priority-fee option in ${walletName} and try again.`,
    );
  }
  throw new Error(`${walletName} returned a signature that does not match this transaction.`);
}
