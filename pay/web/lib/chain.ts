import type { Hex } from "viem";

/**
 * Static chain facts for the checkout. Values are copied from
 * rome-protocol/rome-registry v0.3.0 (chains/200010-hadrian), because the
 * registry package reads the filesystem and cannot run in the browser.
 * The PayRouter address comes from pay/contracts/deployments.json.
 */
export interface RomeChain {
  chainId: number;
  name: string;
  testnet: boolean;
  rpcUrl: string; // EVM JSON-RPC and the Solana-lane composer (proxy)
  explorerUrl: string;
  programId: string; // rome-evm program on Solana
  solanaRpc: string;
  solanaCluster: "devnet" | "mainnet";
  wusdc: Hex; // ERC-20 wrapper over the USDC SPL mint, 6 decimals
  usdcMint: string;
  payRouter: Hex;
}

export const HADRIAN: RomeChain = {
  chainId: 200010,
  name: "Rome Hadrian",
  testnet: true,
  rpcUrl: "https://hadrian.testnet.romeprotocol.xyz/",
  explorerUrl: "https://via-hadrian.testnet.romeprotocol.xyz",
  programId: "RPTWwELXAY4KC9ZPHhaxp7Sq1hHtU3HNEgLbSegCcWf",
  solanaRpc: process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com",
  solanaCluster: "devnet",
  wusdc: "0xbce339ba4c3a8de3bb8af1c5539e6ac11da3112d",
  usdcMint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  payRouter: "0xb2c77558e9720da0888ac9632192cb086de377db",
};

export const CHAIN = HADRIAN;

export const WUSDC_DECIMALS = 6;
export const GAS_DECIMALS = 18;

export const txUrl = (hash: string) => `${CHAIN.explorerUrl}/tx/${hash}`;
export const addressUrl = (address: string) => `${CHAIN.explorerUrl}/address/${address}`;

export const FUNDING_LINKS = {
  faucet: "https://faucet.circle.com/",
  bridge: "https://bridge-api.devnet.romeprotocol.xyz/?chain=200010",
} as const;
