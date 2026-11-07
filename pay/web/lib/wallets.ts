// Wallet discovery without wallet-specific SDKs.
// EVM lane: EIP-6963 announcements (falls back to window.ethereum).
// Solana lane: Wallet Standard; a wallet needs standard:connect,
// solana:signMessage and solana:signTransaction (v1) on the cluster.
// Adapted from create-rome-app template/lib/solanaWallet.ts (MIT).
import { getWallets } from "@wallet-standard/app";
import { PublicKey } from "@solana/web3.js";
import { ed25519 } from "@noble/curves/ed25519";
import { splitV1Wire, type LaneSigner } from "@/vendor/rome-sdk";
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

export function laneSigner(wallet: SolanaWallet, account: SolanaAccount, cluster: string): LaneSigner {
  const features = wallet.features as unknown as Features;
  const chain = solanaChainId(cluster);
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
    signV1Wire: async (wire: Uint8Array) => {
      const [{ signedTransaction }] = (await features["solana:signTransaction"].signTransaction({ account, transaction: wire, chain })) as {
        signedTransaction: Uint8Array;
      }[];
      return pickV1Signature(wallet.name, wire, new Uint8Array(signedTransaction), account.publicKey as Uint8Array);
    },
  };
}

const SIG = 64;

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
    throw new Error(
      `${walletName} changed the transaction before signing it (added or rewrote instructions), so Rome would reject it. Turn off any transaction "protection" or priority-fee option in ${walletName} and try again.`,
    );
  }
  throw new Error(`${walletName} returned a signature that does not match this transaction.`);
}
