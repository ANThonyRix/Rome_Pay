import { keccak256, parseUnits, stringToHex, type Hex } from "viem";

// Shared by the server and the checkout bundle: types, the ref derivation and DTO helpers only.
// Database access lives in lib/store.ts (server-only).

/** A payment the checkout can execute: the amount is known. */
export interface Invoice {
  id: string;
  merchant: { name: string; address: Hex };
  amount: bigint; // wUSDC base units (6 decimals)
  memo: string;
  ref: Hex; // bytes32 emitted in PayRouter.Paid
  demo?: boolean; // sample link; the checkout labels it so nobody mistakes it for a real sale
}

export type LinkStatus = "open" | "paid" | "archived";

/** A payment link as stored. `amount: null` means the payer enters the amount. */
export interface PaymentLink extends Omit<Invoice, "amount"> {
  amount: bigint | null;
  reusable: boolean;
  status: LinkStatus;
}

/** The on-chain ref for a link id. Every reader and writer must derive it the same way. */
export const refFor = (id: string): Hex => keccak256(stringToHex(`rome-pay:${id}`));

/** Link ids are base58, so they read cleanly in a URL and never contain 0/O/I/l. */
export const LINK_ID = /^[1-9A-HJ-NP-Za-km-z]{4,24}$/;

export const MAX_AMOUNT = parseUnits("1000000", 6);

/** Parses a typed USDC amount ("12", "0.5", "1,000.25") into base units, or null if invalid. */
export function parseUsdc(input: string): bigint | null {
  const clean = input.trim().replace(/,/g, "");
  if (!/^\d{1,7}(\.\d{1,6})?$/.test(clean) && !/^\.\d{1,6}$/.test(clean)) return null;
  const value = parseUnits(clean.startsWith(".") ? `0${clean}` : clean, 6);
  return value > 0n && value <= MAX_AMOUNT ? value : null;
}

/** Testnet demo link, served without the database. The merchant address is the project dev wallet. */
export const DEMO_LINK: PaymentLink = {
  id: "demo",
  merchant: { name: "Ostia Type Foundry", address: "0xf35f4fb0c702f38596e711ff5cad2fdd56eb5c2a" },
  amount: parseUnits("0.10", 6),
  memo: "Font licence, Desktop, 1 seat",
  ref: refFor("demo"),
  demo: true,
  reusable: true,
  status: "open",
};

/** Plain-data form that can cross the server/client boundary (no bigint). */
export interface LinkDTO extends Omit<PaymentLink, "amount"> {
  amount: string | null;
}
export const toDTO = (link: PaymentLink): LinkDTO => ({ ...link, amount: link.amount?.toString() ?? null });
export const fromDTO = (dto: LinkDTO): PaymentLink => ({ ...dto, amount: dto.amount === null ? null : BigInt(dto.amount) });
