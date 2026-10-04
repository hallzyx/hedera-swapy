import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

// Amounts are in tinybars (8 decimals), the unit SaucerSwap and the Hedera EVM use for HBAR.
const HBAR = 100_000_000n;
const FEE_TIER = 3000;
const SAUCE_PER_HBAR_FLOOR = 40_000_000n;
const QUOTED_OUT_PER_HBAR = 45_000_000n;
const THRESHOLD = 10n * HBAR;
const PROPOSAL_TTL = 24 * 60 * 60;

enum Status {
  None,
  Pending,
  Executed,
  Vetoed,
}

describe("TreasuryPolicyGuard approval lane", function () {
  async function deployFixture() {
    const [admin, executor, guardian, approver, approver2, recipient, stranger, sauce, whbar] =
      await ethers.getSigners();

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
    await guard.grantRole(await guard.APPROVER_ROLE(), approver.address);
    await guard.grantRole(await guard.APPROVER_ROLE(), approver2.address);
    await guard.setTokenRule(sauce.address, true, SAUCE_PER_HBAR_FLOOR);
    await guard.setRecipient(recipient.address, true);
    await guard.setApprovalPolicy(THRESHOLD, 1);
    await admin.sendTransaction({ to: await guard.getAddress(), value: 200n * HBAR });
    await router.setOutPerHbar(QUOTED_OUT_PER_HBAR);

    const path = ethers.solidityPacked(["address", "uint24", "address"], [whbar.address, FEE_TIER, sauce.address]);
    const minOutFor = (amountIn: bigint) => (amountIn * SAUCE_PER_HBAR_FLOOR) / HBAR;

    const propose = (amountIn = 20n * HBAR, signer = executor) =>
      guard.connect(signer).proposeSwap(path, recipient.address, amountIn, minOutFor(amountIn));

    const deadline = async () => (await time.latest()) + 600;

    return {
      guard,
      router,
      path,
      propose,
      deadline,
      minOutFor,
      admin,
      executor,
      guardian,
      approver,
      approver2,
      recipient,
      stranger,
      sauce,
      whbar,
    };
  }

  describe("direct lane", function () {
    it("rejects a swap above the threshold and points at the approval lane", async function () {
      const { guard, executor, path, recipient, minOutFor, deadline } = await loadFixture(deployFixture);
      const amountIn = 20n * HBAR;
      await expect(
        guard
          .connect(executor)
          .swapHbarForToken(path, recipient.address, amountIn, minOutFor(amountIn), await deadline()),
      )
        .to.be.revertedWithCustomError(guard, "ApprovalRequired")
        .withArgs(amountIn, THRESHOLD);
    });

    it("still allows a swap at the threshold in one transaction", async function () {
      const { guard, executor, path, recipient, minOutFor, deadline } = await loadFixture(deployFixture);
      await expect(
        guard
          .connect(executor)
          .swapHbarForToken(path, recipient.address, THRESHOLD, minOutFor(THRESHOLD), await deadline()),
      ).to.emit(guard, "SwapExecuted");
    });
  });

  describe("propose / approve / execute", function () {
    it("runs the full flow and executes the stored swap", async function () {
      const { guard, router, path, propose, approver, executor, recipient, deadline } =
        await loadFixture(deployFixture);

      await expect(propose()).to.emit(guard, "SwapProposed");
      await expect(guard.connect(approver).approveSwap(1))
        .to.emit(guard, "SwapApproved")
        .withArgs(1, approver.address, 1);
      await expect(guard.connect(executor).executeSwap(1, path, await deadline()))
        .to.emit(guard, "ProposalExecuted")
        .withArgs(1, executor.address);

      expect((await guard.proposals(1)).status).to.equal(Status.Executed);
      expect(await router.lastAmountIn()).to.equal(20n * HBAR);
      expect(await router.lastRecipient()).to.equal(recipient.address);
    });

    it("only executors propose and only approvers approve", async function () {
      const { guard, path, recipient, stranger, executor, propose, minOutFor } = await loadFixture(deployFixture);
      await expect(
        guard.connect(stranger).proposeSwap(path, recipient.address, 20n * HBAR, minOutFor(20n * HBAR)),
      ).to.be.revertedWithCustomError(guard, "AccessControlUnauthorizedAccount");
      await propose();
      await expect(guard.connect(stranger).approveSwap(1)).to.be.revertedWithCustomError(
        guard,
        "AccessControlUnauthorizedAccount",
      );
      await expect(guard.connect(executor).approveSwap(1)).to.be.revertedWithCustomError(
        guard,
        "AccessControlUnauthorizedAccount",
      );
    });

    it("applies the swap policy at proposal time", async function () {
      const { guard, executor, path, recipient, stranger, minOutFor } = await loadFixture(deployFixture);
      await expect(
        guard.connect(executor).proposeSwap(path, stranger.address, 20n * HBAR, minOutFor(20n * HBAR)),
      ).to.be.revertedWithCustomError(guard, "RecipientNotAllowed");
      await expect(
        guard.connect(executor).proposeSwap(path, recipient.address, 60n * HBAR, minOutFor(60n * HBAR)),
      ).to.be.revertedWithCustomError(guard, "AmountOutOfRange");
      await expect(
        guard.connect(executor).proposeSwap(path, recipient.address, 20n * HBAR, 1n),
      ).to.be.revertedWithCustomError(guard, "PriceFloorViolated");
    });

    it("blocks a proposer who also holds the approver role from approving their own proposal", async function () {
      const { guard, executor, propose } = await loadFixture(deployFixture);
      await guard.grantRole(await guard.APPROVER_ROLE(), executor.address);
      await propose();
      await expect(guard.connect(executor).approveSwap(1))
        .to.be.revertedWithCustomError(guard, "SelfApproval")
        .withArgs(1);
    });

    it("counts each approver once", async function () {
      const { guard, propose, approver } = await loadFixture(deployFixture);
      await propose();
      await guard.connect(approver).approveSwap(1);
      await expect(guard.connect(approver).approveSwap(1))
        .to.be.revertedWithCustomError(guard, "AlreadyApproved")
        .withArgs(1, approver.address);
    });

    it("does not execute before the required approvals are in", async function () {
      const { guard, executor, path, propose, approver, approver2, deadline } = await loadFixture(deployFixture);
      await guard.setApprovalPolicy(THRESHOLD, 2);
      await propose();
      await guard.connect(approver).approveSwap(1);
      await expect(guard.connect(executor).executeSwap(1, path, await deadline()))
        .to.be.revertedWithCustomError(guard, "NotEnoughApprovals")
        .withArgs(1, 1, 2);
      await guard.connect(approver2).approveSwap(1);
      await expect(guard.connect(executor).executeSwap(1, path, await deadline())).to.emit(guard, "SwapExecuted");
    });

    it("rejects execution with a different path than the one proposed", async function () {
      const { guard, executor, propose, approver, whbar, sauce, deadline } = await loadFixture(deployFixture);
      const otherPath = ethers.solidityPacked(
        ["address", "uint24", "address"],
        [whbar.address, FEE_TIER + 1, sauce.address],
      );
      await propose();
      await guard.connect(approver).approveSwap(1);
      await expect(guard.connect(executor).executeSwap(1, otherPath, await deadline()))
        .to.be.revertedWithCustomError(guard, "PathMismatch")
        .withArgs(1);
    });

    it("cannot execute twice", async function () {
      const { guard, executor, path, propose, approver, deadline } = await loadFixture(deployFixture);
      await propose();
      await guard.connect(approver).approveSwap(1);
      await guard.connect(executor).executeSwap(1, path, await deadline());
      await expect(guard.connect(executor).executeSwap(1, path, await deadline()))
        .to.be.revertedWithCustomError(guard, "ProposalNotPending")
        .withArgs(1);
    });

    it("expires after the proposal TTL", async function () {
      const { guard, executor, path, propose, approver, deadline } = await loadFixture(deployFixture);
      await propose();
      await guard.connect(approver).approveSwap(1);
      await time.increase(PROPOSAL_TTL + 1);
      await expect(guard.connect(executor).executeSwap(1, path, await deadline()))
        .to.be.revertedWithCustomError(guard, "ProposalExpired")
        .withArgs(1);
    });

    it("re-checks the policy at execution time", async function () {
      const { guard, executor, path, recipient, propose, approver, deadline } = await loadFixture(deployFixture);
      await propose();
      await guard.connect(approver).approveSwap(1);
      await guard.setRecipient(recipient.address, false);
      await expect(guard.connect(executor).executeSwap(1, path, await deadline())).to.be.revertedWithCustomError(
        guard,
        "RecipientNotAllowed",
      );
    });

    it("still enforces the daily cap on approved swaps", async function () {
      const { guard, executor, path, propose, approver, deadline } = await loadFixture(deployFixture);
      for (let i = 1; i <= 3; i++) {
        await propose(40n * HBAR);
        await guard.connect(approver).approveSwap(i);
      }
      await guard.connect(executor).executeSwap(1, path, await deadline());
      await guard.connect(executor).executeSwap(2, path, await deadline());
      await expect(guard.connect(executor).executeSwap(3, path, await deadline())).to.be.revertedWithCustomError(
        guard,
        "DailyCapExceeded",
      );
    });

    it("reports unknown proposals", async function () {
      const { guard, approver } = await loadFixture(deployFixture);
      await expect(guard.connect(approver).approveSwap(99))
        .to.be.revertedWithCustomError(guard, "UnknownProposal")
        .withArgs(99);
    });
  });

  describe("veto and pause", function () {
    it("lets a guardian veto a pending proposal, which then cannot execute", async function () {
      const { guard, executor, guardian, path, propose, approver, deadline } = await loadFixture(deployFixture);
      await propose();
      await guard.connect(approver).approveSwap(1);
      await expect(guard.connect(guardian).vetoSwap(1)).to.emit(guard, "SwapVetoed").withArgs(1, guardian.address);
      expect((await guard.proposals(1)).status).to.equal(Status.Vetoed);
      await expect(guard.connect(executor).executeSwap(1, path, await deadline()))
        .to.be.revertedWithCustomError(guard, "ProposalNotPending")
        .withArgs(1);
    });

    it("lets the admin veto, but not strangers, executors or approvers", async function () {
      const { guard, admin, executor, approver, stranger, propose } = await loadFixture(deployFixture);
      await propose();
      for (const signer of [stranger, executor, approver]) {
        await expect(guard.connect(signer).vetoSwap(1)).to.be.revertedWithCustomError(guard, "NotGuardian");
      }
      await expect(guard.connect(admin).vetoSwap(1)).to.emit(guard, "SwapVetoed");
    });

    it("lets a guardian veto while the treasury is paused", async function () {
      const { guard, guardian, propose } = await loadFixture(deployFixture);
      await propose();
      await guard.connect(guardian).pause();
      await expect(guard.connect(guardian).vetoSwap(1)).to.emit(guard, "SwapVetoed");
    });

    it("blocks propose, approve and execute while paused", async function () {
      const { guard, guardian, executor, approver, path, propose, deadline } = await loadFixture(deployFixture);
      await propose();
      await guard.connect(approver).approveSwap(1);
      await guard.connect(guardian).pause();
      await expect(propose()).to.be.revertedWithCustomError(guard, "EnforcedPause");
      await expect(guard.connect(approver).approveSwap(1)).to.be.revertedWithCustomError(guard, "EnforcedPause");
      await expect(guard.connect(executor).executeSwap(1, path, await deadline())).to.be.revertedWithCustomError(
        guard,
        "EnforcedPause",
      );
    });
  });

  describe("setApprovalPolicy", function () {
    it("is admin-only, emits an event and rejects zero approvals", async function () {
      const { guard, executor } = await loadFixture(deployFixture);
      await expect(guard.setApprovalPolicy(5n * HBAR, 2))
        .to.emit(guard, "ApprovalPolicyUpdated")
        .withArgs(5n * HBAR, 2);
      await expect(guard.setApprovalPolicy(5n * HBAR, 0)).to.be.revertedWithCustomError(guard, "InvalidApprovalPolicy");
      await expect(guard.connect(executor).setApprovalPolicy(1n, 1)).to.be.revertedWithCustomError(
        guard,
        "AccessControlUnauthorizedAccount",
      );
    });

    it("is disabled by default so the direct lane keeps working", async function () {
      const router = await (await ethers.getContractFactory("MockSaucerSwapRouter")).deploy();
      const [admin, , , , , , , , whbar] = await ethers.getSigners();
      const guard = await (
        await ethers.getContractFactory("TreasuryPolicyGuard")
      ).deploy(admin.address, await router.getAddress(), whbar.address, {
        minAmountIn: 1n,
        maxAmountIn: HBAR,
        dailyCap: HBAR,
      });
      const policy = await guard.approvalPolicy();
      expect(policy.threshold).to.equal(ethers.MaxUint256);
      expect(policy.required).to.equal(1);
    });
  });
});
