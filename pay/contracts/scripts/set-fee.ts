import hardhat from "hardhat";
import { getAddress, isAddress } from "viem";

// Set the protocol fee on a deployed PayRouter (owner only).
// Env: PAY_ROUTER (required), FEE_RECIPIENT (required unless FEE_BPS=0), FEE_BPS (default 100 = 1%, max 100).

const EXPLORER: Record<number, string> = {
  200010: "https://via-hadrian.testnet.romeprotocol.xyz",
  7531: "https://via-rubicon.mainnet.romeprotocol.xyz",
};
const ZERO = "0x0000000000000000000000000000000000000000";

async function main() {
  const routerAddress = process.env.PAY_ROUTER;
  if (!routerAddress || !isAddress(routerAddress)) throw new Error("Set PAY_ROUTER to the deployed PayRouter address");

  const feeBps = Number(process.env.FEE_BPS ?? "100");
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 100) throw new Error("FEE_BPS must be an integer from 0 to 100");

  const rawRecipient = process.env.FEE_RECIPIENT ?? (feeBps === 0 ? ZERO : "");
  if (!isAddress(rawRecipient)) throw new Error("Set FEE_RECIPIENT to the treasury address");
  const recipient = getAddress(rawRecipient);

  const { viem } = await hardhat.network.create();
  const publicClient = await viem.getPublicClient();
  const [owner] = await viem.getWalletClients();
  const explorer = EXPLORER[await publicClient.getChainId()] ?? "";

  const router = await viem.getContractAt("PayRouter", getAddress(routerAddress));
  const currentOwner = await router.read.owner();
  if (getAddress(currentOwner) !== getAddress(owner.account.address)) {
    throw new Error(`Signer ${owner.account.address} is not the router owner ${currentOwner}`);
  }
  if (recipient === getAddress(router.address)) throw new Error("FEE_RECIPIENT cannot be the router itself");

  const [oldBps, oldRecipient] = await Promise.all([router.read.feeBps(), router.read.feeRecipient()]);
  console.log(`Current fee: ${oldBps} bps to ${oldRecipient}`);

  const hash = await router.write.setFee([feeBps, recipient], { account: owner.account });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`setFee: ${receipt.status} gas=${receipt.gasUsed} ${explorer}/tx/${hash}`);
  if (receipt.status !== "success") throw new Error("setFee failed");

  const [newBps, newRecipient] = await Promise.all([router.read.feeBps(), router.read.feeRecipient()]);
  console.log(`New fee: ${newBps} bps (${Number(newBps) / 100}%) to ${newRecipient}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
