import "server-only";
import { createPublicClient, defineChain, http, parseAbi, parseAbiItem } from "viem";
import { CHAIN } from "./chain";

export const romeChain = defineChain({
  id: CHAIN.chainId,
  name: CHAIN.name,
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [CHAIN.rpcUrl] } },
  blockExplorers: { default: { name: "Via", url: CHAIN.explorerUrl } },
  testnet: CHAIN.testnet,
});

export const publicClient = createPublicClient({ chain: romeChain, transport: http(CHAIN.rpcUrl, { retryCount: 2 }) });

export const PAID_EVENT = parseAbiItem(
  "event Paid(bytes32 indexed ref, address indexed merchant, address indexed payer, uint256 amount, uint256 fee)",
);

export const ROUTER_ABI = parseAbi([
  "function feeBps() view returns (uint16)",
  "function feeRecipient() view returns (address)",
]);
export const ERC20_ABI = parseAbi(["function balanceOf(address) view returns (uint256)"]);

/** No Paid events exist before this block (PayRouter v2 went live just after it). */
export const ROUTER_FROM_BLOCK = 519_600_000n;

/** Hadrian rejects eth_getLogs spans of 1M blocks; 400k passes. About 4 blocks per second. */
export const LOG_SPAN = 400_000n;
