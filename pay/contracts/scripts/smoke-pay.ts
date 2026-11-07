import hardhat from "hardhat";
import { getAddress, keccak256, parseAbi, parseUnits, toHex } from "viem";

// End-to-end EVM-lane payment through a deployed PayRouter:
// wrap gas USDC into wUSDC -> one-time wrapper grant -> approve -> pay.
// Env: PAY_ROUTER (required), PAY_MERCHANT (default: deployer), PAY_AMOUNT (wUSDC, default 0.1).

const WITHDRAW = "0x4200000000000000000000000000000000000016";
const HELPER = "0xff00000000000000000000000000000000000009";
const EXPLORER: Record<number, string> = {
  200010: "https://via-hadrian.testnet.romeprotocol.xyz",
  7531: "https://via-rubicon.mainnet.romeprotocol.xyz",
};

const wrapperAbi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function isEnabled(address user) view returns (bool)",
  "function mint_id() view returns (bytes32)",
]);
const withdrawAbi = parseAbi(["function withdraw_to_ata(uint256 wei_)"]);
const helperAbi = parseAbi(["function approve_spl(address spender, uint64 amount, bytes32 mint)"]);

async function main() {
  const routerAddress = process.env.PAY_ROUTER;
  if (!routerAddress) throw new Error("Set PAY_ROUTER to the deployed PayRouter address");

  const { viem } = await hardhat.network.create();
  const publicClient = await viem.getPublicClient();
  const [payer] = await viem.getWalletClients();
  const chainId = await publicClient.getChainId();
  const explorer = EXPLORER[chainId] ?? "";

  const router = await viem.getContractAt("PayRouter", getAddress(routerAddress));
  const wusdc = await router.read.token();
  const merchant = getAddress(process.env.PAY_MERCHANT ?? payer.account.address);
  const amount = parseUnits(process.env.PAY_AMOUNT ?? "0.1", 6);
  const ref = keccak256(toHex(`smoke-${Date.now()}`));

  async function send(label: string, hash: `0x${string}`) {
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`${label}: ${receipt.status} gas=${receipt.gasUsed} ${explorer}/tx/${hash}`);
    if (receipt.status !== "success") throw new Error(`${label} failed`);
  }

  const balance = await publicClient.readContract({
    address: wusdc, abi: wrapperAbi, functionName: "balanceOf", args: [payer.account.address],
  });
  if (balance < amount) {
    // Gas USDC has 18 decimals, wUSDC 6: the wrapped amount must be a multiple of 1e12 wei.
    const wei = (amount - balance) * 10n ** 12n;
    await send("wrap", await payer.writeContract({
      address: WITHDRAW, abi: withdrawAbi, functionName: "withdraw_to_ata", args: [wei],
    }));
  }

  const enabled = await publicClient.readContract({
    address: wusdc, abi: wrapperAbi, functionName: "isEnabled", args: [payer.account.address],
  });
  if (!enabled) {
    const mint = await publicClient.readContract({ address: wusdc, abi: wrapperAbi, functionName: "mint_id" });
    await send("grant", await payer.writeContract({
      address: HELPER, abi: helperAbi, functionName: "approve_spl", args: [wusdc, 2n ** 64n - 1n, mint],
    }));
  }

  await send("approve", await payer.writeContract({
    address: wusdc, abi: wrapperAbi, functionName: "approve", args: [router.address, amount],
  }));
  await send("pay", await router.write.pay([merchant, amount, ref], { account: payer.account }));

  console.log(`Paid ${amount} wUSDC units to ${merchant}, ref ${ref}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
