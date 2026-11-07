import { keccak256, parseUnits, stringToHex, type Hex } from "viem";

export interface Invoice {
  id: string;
  merchant: { name: string; address: Hex };
  amount: bigint; // wUSDC base units (6 decimals)
  memo: string;
  ref: Hex; // bytes32 emitted in PayRouter.Paid, matched by the backend
  demo?: boolean; // sample invoice; the checkout labels it so nobody mistakes it for a real sale
}

/** The on-chain ref for an invoice id. pay/server must derive it the same way. */
export const refFor = (id: string): Hex => keccak256(stringToHex(`rome-pay:${id}`));

/**
 * Testnet demo invoices. Real invoices will come from pay/server; until then
 * the checkout reads this table. The merchant address is the project dev wallet.
 */
const DEMO: Omit<Invoice, "ref">[] = [
  {
    id: "demo",
    merchant: { name: "Ostia Type Foundry", address: "0xf35f4fb0c702f38596e711ff5cad2fdd56eb5c2a" },
    amount: parseUnits("0.10", 6),
    memo: "Font licence, Desktop, 1 seat",
    demo: true,
  },
];

export async function getInvoice(id: string): Promise<Invoice | null> {
  const row = DEMO.find((inv) => inv.id === id);
  return row ? { ...row, ref: refFor(row.id) } : null;
}

/** Plain-data form that can cross the server/client boundary (no bigint). */
export interface InvoiceDTO extends Omit<Invoice, "amount"> {
  amount: string;
}
export const toDTO = (inv: Invoice): InvoiceDTO => ({ ...inv, amount: inv.amount.toString() });
export const fromDTO = (dto: InvoiceDTO): Invoice => ({ ...dto, amount: BigInt(dto.amount) });
