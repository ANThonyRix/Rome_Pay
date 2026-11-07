import hardhat from "hardhat";
import { getAddress } from "viem";

// Canonical wUSDC wrappers (docs.rome.builders/reference/contract-addresses).
const WUSDC: Record<number, `0x${string}`> = {
  200010: "0xbce339ba4c3a8de3bb8af1c5539e6ac11da3112d", // Hadrian
  7531: "0x0952d233b0c254cd375f3bfb3e5869c1a906f9b3", // Rubicon
};

async function main() {
  const { viem } = await hardhat.network.create();
  const publicClient = await viem.getPublicClient();
  const [deployer] = await viem.getWalletClients();

  const chainId = await publicClient.getChainId();
  const wusdc = WUSDC[chainId];
  if (!wusdc) throw new Error(`No wUSDC wrapper known for chain ${chainId}`);

  const owner = getAddress(process.env.PAY_OWNER ?? deployer.account.address);
  console.log(`Deploying PayRouter on chain ${chainId} (token ${wusdc}, owner ${owner})`);

  const router = await viem.deployContract("PayRouter", [wusdc, owner]);
  console.log("PayRouter deployed to:", router.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
