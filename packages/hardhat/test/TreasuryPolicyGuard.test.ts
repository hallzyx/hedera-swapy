import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

// Amounts are in tinybars (8 decimals), the unit SaucerSwap and the Hedera EVM use for HBAR.
const HBAR = 100_000_000n;
const FEE_TIER = 3000;
const SAUCE_PER_HBAR_FLOOR = 40_000_000n; // 40 SAUCE (6 decimals) per 1 HBAR
const QUOTED_OUT_PER_HBAR = 45_000_000n;

describe("TreasuryPolicyGuard", function () {
  async function deployFixture() {
    const [admin, executor, guardian, recipient, stranger, sauce, whbar, otherToken] = await ethers.getSigners();

    const router = await (await ethers.getContractFactory("MockSaucerSwapRouter")).deploy();
    await router.waitForDeployment();

    const guard = await (
      await ethers.getContractFactory("TreasuryPolicyGuard")
    ).deploy(admin.address, await router.getAddress(), whbar.address, {
      minAmountIn: HBAR / 10n,
      maxAmountIn: 50n * HBAR,
      dailyCap: 100n * HBAR,
    });
    await guard.waitForDeployment();

    await guard.grantRole(await guard.EXECUTOR_ROLE(), executor.address);
    await guard.grantRole(await guard.GUARDIAN_ROLE(), guardian.address);
    await guard.setTokenRule(sauce.address, true, SAUCE_PER_HBAR_FLOOR);
    await guard.setRecipient(recipient.address, true);
    await admin.sendTransaction({ to: await guard.getAddress(), value: 200n * HBAR });

    await router.setOutPerHbar(QUOTED_OUT_PER_HBAR);

    const path = ethers.solidityPacked(["address", "uint24", "address"], [whbar.address, FEE_TIER, sauce.address]);

    const swap = async (
      overrides: {
        signer?: typeof admin;
        path?: string;
        recipient?: string;
        amountIn?: bigint;
        minOut?: bigint;
        deadline?: number;
      } = {},
    ) => {
      const deadline = overrides.deadline ?? (await time.latest()) + 600;
      const amountIn = overrides.amountIn ?? 10n * HBAR;
      return guard
        .connect(overrides.signer ?? executor)
        .swapHbarForToken(
          overrides.path ?? path,
          overrides.recipient ?? recipient.address,
          amountIn,
          overrides.minOut ?? (amountIn * SAUCE_PER_HBAR_FLOOR) / HBAR,
          deadline,
        );
    };

    return { guard, router, swap, path, admin, executor, guardian, recipient, stranger, sauce, whbar, otherToken };
  }

  describe("swapHbarForToken", function () {
    it("forwards exactly amountIn to the router and emits SwapExecuted", async function () {
      const { guard, router, swap, executor, recipient, sauce } = await loadFixture(deployFixture);
      const amountIn = 10n * HBAR;
      const minOut = (amountIn * SAUCE_PER_HBAR_FLOOR) / HBAR;

      await expect(swap({ amountIn }))
        .to.emit(guard, "SwapExecuted")
        .withArgs(
          executor.address,
          recipient.address,
          sauce.address,
          amountIn,
          minOut,
          QUOTED_OUT_PER_HBAR * 10n,
          anyValue,
        );

      expect(await router.lastAmountIn()).to.equal(amountIn);
      expect(await router.lastValue()).to.equal(amountIn);
      expect(await router.lastRecipient()).to.equal(recipient.address);
      expect(await router.refundCalls()).to.equal(1n);
    });

    it("only lets EXECUTOR_ROLE swap", async function () {
      const { guard, swap, stranger, guardian } = await loadFixture(deployFixture);
      await expect(swap({ signer: stranger })).to.be.revertedWithCustomError(guard, "AccessControlUnauthorizedAccount");
      await expect(swap({ signer: guardian })).to.be.revertedWithCustomError(guard, "AccessControlUnauthorizedAccount");
    });

    it("rejects amounts below the minimum and above the per-swap maximum", async function () {
      const { guard, swap } = await loadFixture(deployFixture);
      await expect(swap({ amountIn: HBAR / 10n - 1n, minOut: 1n })).to.be.revertedWithCustomError(
        guard,
        "AmountOutOfRange",
      );
      await expect(swap({ amountIn: 50n * HBAR + 1n })).to.be.revertedWithCustomError(guard, "AmountOutOfRange");
    });

    it("enforces the rolling daily cap and resets on the next UTC day", async function () {
      const { guard, swap } = await loadFixture(deployFixture);
      await swap({ amountIn: 40n * HBAR });
      await swap({ amountIn: 40n * HBAR });
      expect(await guard.remainingToday()).to.equal(20n * HBAR);

      await expect(swap({ amountIn: 40n * HBAR }))
        .to.be.revertedWithCustomError(guard, "DailyCapExceeded")
        .withArgs(120n * HBAR, 100n * HBAR);

      await time.increase(24 * 60 * 60);
      await expect(swap({ amountIn: 40n * HBAR })).to.emit(guard, "SwapExecuted");
    });

    it("rejects tokens that are not on the allowlist", async function () {
      const { guard, swap, whbar, otherToken } = await loadFixture(deployFixture);
      const badPath = ethers.solidityPacked(
        ["address", "uint24", "address"],
        [whbar.address, FEE_TIER, otherToken.address],
      );
      await expect(swap({ path: badPath }))
        .to.be.revertedWithCustomError(guard, "TokenNotAllowed")
        .withArgs(otherToken.address);
    });

    it("rejects recipients that are not on the payout allowlist", async function () {
      const { guard, swap, stranger } = await loadFixture(deployFixture);
      await expect(swap({ recipient: stranger.address }))
        .to.be.revertedWithCustomError(guard, "RecipientNotAllowed")
        .withArgs(stranger.address);
    });

    it("rejects paths that are not a single hop starting at WHBAR", async function () {
      const { guard, swap, sauce, whbar, otherToken } = await loadFixture(deployFixture);
      const multiHop = ethers.solidityPacked(
        ["address", "uint24", "address", "uint24", "address"],
        [whbar.address, FEE_TIER, otherToken.address, FEE_TIER, sauce.address],
      );
      await expect(swap({ path: multiHop })).to.be.revertedWithCustomError(guard, "InvalidPath");

      const wrongTokenIn = ethers.solidityPacked(
        ["address", "uint24", "address"],
        [otherToken.address, FEE_TIER, sauce.address],
      );
      await expect(swap({ path: wrongTokenIn })).to.be.revertedWithCustomError(guard, "InvalidPath");
    });

    it("enforces the price floor and a non-zero amountOutMinimum", async function () {
      const { guard, swap } = await loadFixture(deployFixture);
      const amountIn = 2n * HBAR;
      const required = (amountIn * SAUCE_PER_HBAR_FLOOR) / HBAR; // 80 SAUCE

      await expect(swap({ amountIn, minOut: required - 1n }))
        .to.be.revertedWithCustomError(guard, "PriceFloorViolated")
        .withArgs(required - 1n, required);
      await expect(swap({ amountIn, minOut: 0n })).to.be.revertedWithCustomError(guard, "PriceFloorViolated");
      await expect(swap({ amountIn, minOut: required })).to.emit(guard, "SwapExecuted");
    });

    it("rejects deadlines in the past or beyond the allowed window", async function () {
      const { guard, swap } = await loadFixture(deployFixture);
      const now = await time.latest();
      await expect(swap({ deadline: now - 1 })).to.be.revertedWithCustomError(guard, "DeadlineOutOfRange");
      await expect(swap({ deadline: now + 2 * 60 * 60 })).to.be.revertedWithCustomError(guard, "DeadlineOutOfRange");
    });

    it("reverts and leaves no spend recorded when the router fails", async function () {
      const { guard, router, swap } = await loadFixture(deployFixture);
      await router.setOutPerHbar(1n); // output far below amountOutMinimum, so the mock router reverts
      await expect(swap({ amountIn: 10n * HBAR })).to.be.reverted;
      expect(await guard.remainingToday()).to.equal(100n * HBAR);
    });

    it("reverts when the treasury cannot cover amountIn", async function () {
      const { guard, swap, admin, stranger } = await loadFixture(deployFixture);
      await guard.connect(admin).withdraw(stranger.address, 195n * HBAR);
      await expect(swap({ amountIn: 10n * HBAR }))
        .to.be.revertedWithCustomError(guard, "InsufficientTreasury")
        .withArgs(5n * HBAR, 10n * HBAR);
    });
  });

  describe("pause", function () {
    it("lets a guardian pause but only the admin unpause", async function () {
      const { guard, swap, admin, guardian } = await loadFixture(deployFixture);
      await guard.connect(guardian).pause();
      await expect(swap()).to.be.revertedWithCustomError(guard, "EnforcedPause");

      await expect(guard.connect(guardian).unpause()).to.be.revertedWithCustomError(
        guard,
        "AccessControlUnauthorizedAccount",
      );
      await guard.connect(admin).unpause();
      await expect(swap()).to.emit(guard, "SwapExecuted");
    });

    it("does not let strangers pause", async function () {
      const { guard, stranger } = await loadFixture(deployFixture);
      await expect(guard.connect(stranger).pause()).to.be.revertedWithCustomError(guard, "NotGuardian");
    });
  });

  describe("administration", function () {
    it("only the admin can change limits, token rules and recipients", async function () {
      const { guard, stranger, sauce } = await loadFixture(deployFixture);
      const unauthorized = "AccessControlUnauthorizedAccount";
      await expect(
        guard.connect(stranger).setLimits({ minAmountIn: 1n, maxAmountIn: 2n, dailyCap: 3n }),
      ).to.be.revertedWithCustomError(guard, unauthorized);
      await expect(guard.connect(stranger).setTokenRule(sauce.address, false, 0n)).to.be.revertedWithCustomError(
        guard,
        unauthorized,
      );
      await expect(guard.connect(stranger).setRecipient(stranger.address, true)).to.be.revertedWithCustomError(
        guard,
        unauthorized,
      );
    });

    it("rejects inconsistent limits", async function () {
      const { guard, admin } = await loadFixture(deployFixture);
      await expect(
        guard.connect(admin).setLimits({ minAmountIn: 5n, maxAmountIn: 4n, dailyCap: 10n }),
      ).to.be.revertedWithCustomError(guard, "InvalidLimits");
      await expect(
        guard.connect(admin).setLimits({ minAmountIn: 1n, maxAmountIn: 10n, dailyCap: 9n }),
      ).to.be.revertedWithCustomError(guard, "InvalidLimits");
      await expect(
        guard.connect(admin).setLimits({ minAmountIn: 0n, maxAmountIn: 0n, dailyCap: 0n }),
      ).to.be.revertedWithCustomError(guard, "InvalidLimits");
    });

    it("lets the admin withdraw, and nobody else", async function () {
      const { guard, admin, stranger } = await loadFixture(deployFixture);
      await expect(guard.connect(stranger).withdraw(stranger.address, 1n)).to.be.revertedWithCustomError(
        guard,
        "AccessControlUnauthorizedAccount",
      );
      await expect(guard.connect(admin).withdraw(stranger.address, 10n * HBAR)).to.changeEtherBalance(
        stranger,
        10n * HBAR,
      );
    });

    it("accepts HBAR top-ups from anyone and emits Funded", async function () {
      const { guard, stranger } = await loadFixture(deployFixture);
      await expect(stranger.sendTransaction({ to: await guard.getAddress(), value: HBAR }))
        .to.emit(guard, "Funded")
        .withArgs(stranger.address, HBAR);
    });
  });
});
