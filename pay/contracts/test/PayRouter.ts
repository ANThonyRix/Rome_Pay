import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { getAddress, keccak256, parseUnits, toHex, zeroAddress } from "viem";

describe("PayRouter", async function () {
  const { viem } = await network.create();
  const [owner, payer, merchant, treasury, stranger] = await viem.getWalletClients();

  const ref = keccak256(toHex("invoice-001"));
  const amount = parseUnits("25", 6); // 25 wUSDC

  async function deploy() {
    const token = await viem.deployContract("MockWUSDC");
    const router = await viem.deployContract("PayRouter", [token.address, owner.account.address]);
    await token.write.mint([payer.account.address, parseUnits("1000", 6)]);
    await token.write.approve([router.address, amount], { account: payer.account });
    return { token, router };
  }

  it("moves the full amount to the merchant when there is no fee", async function () {
    const { token, router } = await deploy();

    await viem.assertions.emitWithArgs(
      router.write.pay([merchant.account.address, amount, ref], { account: payer.account }),
      router,
      "Paid",
      [ref, getAddress(merchant.account.address), getAddress(payer.account.address), amount, 0n],
    );

    assert.equal(await token.read.balanceOf([merchant.account.address]), amount);
    assert.equal(await token.read.balanceOf([router.address]), 0n);
  });

  it("splits the protocol fee to the fee recipient", async function () {
    const { token, router } = await deploy();
    await router.write.setFee([50, treasury.account.address]); // 0.5%

    const fee = (amount * 50n) / 10_000n;
    await router.write.pay([merchant.account.address, amount, ref], { account: payer.account });

    assert.equal(await token.read.balanceOf([treasury.account.address]), fee);
    assert.equal(await token.read.balanceOf([merchant.account.address]), amount - fee);
    assert.equal(await token.read.balanceOf([router.address]), 0n);
  });

  it("reverts on zero merchant or zero amount", async function () {
    const { router } = await deploy();

    await viem.assertions.revertWithCustomError(
      router.write.pay([zeroAddress, amount, ref], { account: payer.account }),
      router,
      "ZeroAddress",
    );
    await viem.assertions.revertWithCustomError(
      router.write.pay([merchant.account.address, 0n, ref], { account: payer.account }),
      router,
      "ZeroAmount",
    );
  });

  it("reverts when the payer has not approved enough", async function () {
    const { router } = await deploy();

    await viem.assertions.revertWithCustomError(
      router.write.pay([merchant.account.address, amount + 1n, ref], { account: payer.account }),
      await viem.getContractAt("MockWUSDC", await router.read.token()),
      "ERC20InsufficientAllowance",
    );
  });

  it("caps the fee and guards the fee recipient", async function () {
    const { router } = await deploy();

    await viem.assertions.revertWithCustomError(
      router.write.setFee([101, treasury.account.address]),
      router,
      "FeeTooHigh",
    );
    await viem.assertions.revertWithCustomError(
      router.write.setFee([10, zeroAddress]),
      router,
      "ZeroAddress",
    );
  });

  it("never makes the router itself a recipient", async function () {
    const { router } = await deploy();

    await viem.assertions.revertWithCustomError(
      router.write.pay([router.address, amount, ref], { account: payer.account }),
      router,
      "InvalidRecipient",
    );
    await viem.assertions.revertWithCustomError(
      router.write.setFee([10, router.address]),
      router,
      "InvalidRecipient",
    );
  });

  it("conserves value: merchant + fee == amount, router keeps nothing", async function () {
    const { token, router } = await deploy();
    await router.write.setFee([100, treasury.account.address]); // max fee, 1%

    const amounts = [1n, 99n, 100n, 101n, 12_345n, parseUnits("0.999999", 6), parseUnits("123.456789", 6)];
    const total = amounts.reduce((sum, a) => sum + a, 0n);
    await token.write.approve([router.address, total], { account: payer.account });

    let expectedFees = 0n;
    for (const a of amounts) {
      const merchantBefore = await token.read.balanceOf([merchant.account.address]);
      await router.write.pay([merchant.account.address, a, ref], { account: payer.account });
      const fee = (a * 100n) / 10_000n; // rounds down: payments under 100 units pay no fee
      expectedFees += fee;
      assert.equal(await token.read.balanceOf([merchant.account.address]) - merchantBefore, a - fee);
    }

    assert.equal(await token.read.balanceOf([treasury.account.address]), expectedFees);
    assert.equal(await token.read.balanceOf([router.address]), 0n);
    assert.equal(await token.read.allowance([payer.account.address, router.address]), 0n);
  });

  it("handles fee recipient == merchant", async function () {
    const { token, router } = await deploy();
    await router.write.setFee([50, merchant.account.address]);

    await router.write.pay([merchant.account.address, amount, ref], { account: payer.account });
    assert.equal(await token.read.balanceOf([merchant.account.address]), amount);
  });

  it("cannot pull from someone else's allowance", async function () {
    const { token, router } = await deploy();

    // payer approved the router, but a stranger calling pay() only spends the stranger's own tokens
    await viem.assertions.revertWithCustomError(
      router.write.pay([stranger.account.address, amount, ref], { account: stranger.account }),
      token,
      "ERC20InsufficientAllowance",
    );
    assert.equal(await token.read.allowance([payer.account.address, router.address]), amount);
  });

  it("hands ownership over in two steps", async function () {
    const { router } = await deploy();

    await router.write.transferOwnership([treasury.account.address]);
    assert.equal(getAddress(await router.read.owner()), getAddress(owner.account.address));

    await router.write.acceptOwnership({ account: treasury.account });
    assert.equal(getAddress(await router.read.owner()), getAddress(treasury.account.address));

    await viem.assertions.revertWithCustomError(
      router.write.setFee([10, treasury.account.address]),
      router,
      "OwnableUnauthorizedAccount",
    );
  });

  it("only lets the owner change the fee", async function () {
    const { router } = await deploy();

    await viem.assertions.revertWithCustomError(
      router.write.setFee([10, treasury.account.address], { account: stranger.account }),
      router,
      "OwnableUnauthorizedAccount",
    );
  });
});
