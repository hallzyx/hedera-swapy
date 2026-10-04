/**
 * Headless evidence run for a deployed TreasuryPolicyGuard on Hedera testnet.
 * It sends real transactions and prints a markdown table of HashScan links:
 *   1. an approved swap inside the policy
 *   2. a swap above the per-swap limit (rejected by the contract, visible as a reverted tx)
 *   3. a proposal above the approval threshold: approve -> execute, and a second one that is vetoed
 *   4. a guardian pause that blocks a swap, then an admin unpause
 *
 * Env (shell only, never commit):
 *   TREASURY_GUARD_ADDRESS   deployed guard (or NEXT_PUBLIC_TREASURY_GUARD_ADDRESS)
 *   SWAP_PRIVATE_KEY         executor, also admin and guardian with the starter deploy (ECDSA hex)
 *   APPROVER_PRIVATE_KEY     optional, enables step 3 (must differ from the executor; deploy with TREASURY_APPROVER)
 *   GUARDIAN_PRIVATE_KEY     optional, defaults to SWAP_PRIVATE_KEY
 *   ADMIN_PRIVATE_KEY        optional, defaults to SWAP_PRIVATE_KEY
 *
 * Usage: yarn demo:guard
 */
import { createPublicClient, createWalletClient, decodeFunctionResult, encodeFunctionData, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hederaTestnet } from "viem/chains";

const toSol = n => `0x${BigInt(n).toString(16).padStart(40, "0")}`;
const WHBAR = toSol(15058);
const SAUCE = toSol(1183558);
const QUOTER = toSol(1390002);
const HTS = "0x0000000000000000000000000000000000000167";
const FEE = 3000;
const HBAR = 100_000_000n;
const RPC = process.env.NEXT_PUBLIC_HEDERA_TESTNET_RPC_URL || "https://testnet.hashio.io/api";
const MIRROR = "https://testnet.mirrornode.hedera.com";
const GAS = 2_000_000n;

const quoterAbi = parseAbi([
  "function quoteExactInput(bytes path, uint256 amountIn) returns (uint256 amountOut, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate)",
]);
const htsAbi = parseAbi(["function associateToken(address account, address token) returns (int64 responseCode)"]);
const guardAbi = parseAbi([
  "function limits() view returns (uint256 minAmountIn, uint256 maxAmountIn, uint256 dailyCap)",
  "function approvalPolicy() view returns (uint256 threshold, uint8 required)",
  "function tokenRules(address token) view returns (bool allowed, uint256 minOutPerHbar)",
  "function paused() view returns (bool)",
  "function proposalCount() view returns (uint256)",
  "function swapHbarForToken(bytes path, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint256 deadline) returns (uint256)",
  "function proposeSwap(bytes path, address recipient, uint256 amountIn, uint256 amountOutMinimum) returns (uint256)",
  "function approveSwap(uint256 id)",
  "function vetoSwap(uint256 id)",
  "function executeSwap(uint256 id, bytes path, uint256 deadline) returns (uint256)",
  "function pause()",
  "function unpause()",
]);

const guard = process.env.TREASURY_GUARD_ADDRESS || process.env.NEXT_PUBLIC_TREASURY_GUARD_ADDRESS;
const executorKey = process.env.SWAP_PRIVATE_KEY;
if (!guard || !executorKey) {
  console.error("Set TREASURY_GUARD_ADDRESS and SWAP_PRIVATE_KEY (see the header of this file).");
  process.exit(1);
}

const hex = key => (key.startsWith("0x") ? key : `0x${key}`);
const transport = http(RPC, { batch: false });
const publicClient = createPublicClient({ chain: hederaTestnet, transport });
const walletFor = key =>
  createWalletClient({ account: privateKeyToAccount(hex(key)), chain: hederaTestnet, transport });

const executor = walletFor(executorKey);
const guardian = walletFor(process.env.GUARDIAN_PRIVATE_KEY || executorKey);
const admin = walletFor(process.env.ADMIN_PRIVATE_KEY || executorKey);
const approver = process.env.APPROVER_PRIVATE_KEY ? walletFor(process.env.APPROVER_PRIVATE_KEY) : null;
const recipient = executor.account.address;

const path = `0x${WHBAR.slice(2)}${FEE.toString(16).padStart(6, "0")}${SAUCE.slice(2)}`;
const evidence = [];

const link = hash => `https://hashscan.io/testnet/transaction/${hash}`;
const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 1200);

/** Sends a guard call with a fixed gas limit so a policy rejection is mined as a reverted tx with a HashScan page. */
async function send(label, wallet, functionName, args, expect) {
  const hash = await wallet.writeContract({ address: guard, abi: guardAbi, functionName, args, gas: GAS });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const outcome = receipt.status === "success" ? "success" : "reverted";
  const ok = outcome === expect;
  console.log(`${ok ? "OK  " : "WARN"} ${label}: ${outcome} (expected ${expect}) ${link(hash)}`);
  evidence.push({ label, expect, outcome, hash });
  return { hash, outcome };
}

async function quote(amount) {
  const data = encodeFunctionData({ abi: quoterAbi, functionName: "quoteExactInput", args: [path, amount] });
  const raw = await publicClient.call({ to: QUOTER, data });
  return decodeFunctionResult({ abi: quoterAbi, functionName: "quoteExactInput", data: raw.data })[0];
}

/** Minimum output: 1% slippage, never below the contract's price floor. */
async function minOutFor(amount, floorPerHbar) {
  const quoted = await quote(amount);
  const withSlippage = (quoted * 9900n) / 10000n;
  const floor = (amount * floorPerHbar) / HBAR;
  return withSlippage > floor ? withSlippage : floor;
}

async function ensureAssociated() {
  const res = await fetch(`${MIRROR}/api/v1/accounts/${recipient}/tokens?token.id=0.0.1183558&limit=1`);
  const body = res.ok ? await res.json() : null;
  if (body && Array.isArray(body.tokens) && body.tokens.length > 0) return;
  console.log("Associating the payout account with SAUCE…");
  const hash = await executor.writeContract({
    address: HTS,
    abi: htsAbi,
    functionName: "associateToken",
    args: [recipient, SAUCE],
    gas: 1_000_000n,
  });
  await publicClient.waitForTransactionReceipt({ hash });
}

async function main() {
  console.log("Guard", guard, "| executor/payout", recipient);
  const read = functionName => publicClient.readContract({ address: guard, abi: guardAbi, functionName });
  const [limits, policy, paused] = await Promise.all([read("limits"), read("approvalPolicy"), read("paused")]);
  const rule = await publicClient.readContract({
    address: guard,
    abi: guardAbi,
    functionName: "tokenRules",
    args: [SAUCE],
  });
  console.log("Limits (tinybars)", limits, "| approval", policy, "| paused", paused, "| SAUCE rule", rule);
  if (paused) throw new Error("The guard is paused. Unpause it first.");
  if (!rule[0]) throw new Error("SAUCE is not allowed on this guard. Run the deploy script or call setTokenRule.");

  await ensureAssociated();
  const [minIn, maxIn] = limits;
  const [threshold] = policy;
  const approvalOn = threshold < maxIn;

  // 1. approved swap (smallest amount that is allowed and needs no approval)
  const small = minIn > HBAR ? minIn : HBAR;
  await send(
    `Approved swap of ${small / HBAR} HBAR inside the policy`,
    executor,
    "swapHbarForToken",
    [path, recipient, small, await minOutFor(small, rule[1]), deadline()],
    "success",
  );

  // 2. rejected swap: one tinybar above the per-swap maximum
  const tooBig = maxIn + HBAR;
  await send(
    `Rejected swap of ${tooBig / HBAR} HBAR (above the direct-lane limit, refused by the contract)`,
    executor,
    "swapHbarForToken",
    [path, recipient, tooBig, 1n, deadline()],
    "reverted",
  );

  // 3. approval lane
  if (approver && approvalOn) {
    const large = threshold + HBAR;
    const minOut = await minOutFor(large, rule[1]);
    await send(
      `Direct swap of ${large / HBAR} HBAR is refused (needs approval)`,
      executor,
      "swapHbarForToken",
      [path, recipient, large, minOut, deadline()],
      "reverted",
    );

    await send(`Propose ${large / HBAR} HBAR`, executor, "proposeSwap", [path, recipient, large, minOut], "success");
    const id1 = await publicClient.readContract({ address: guard, abi: guardAbi, functionName: "proposalCount" });
    await send(
      `Approval from the proposer's account (no approver role) is refused for proposal #${id1}`,
      executor,
      "approveSwap",
      [id1],
      "reverted",
    );
    await send(`Approver signs proposal #${id1}`, approver, "approveSwap", [id1], "success");
    await send(`Execute proposal #${id1}`, executor, "executeSwap", [id1, path, deadline()], "success");

    await send(
      `Propose ${large / HBAR} HBAR again`,
      executor,
      "proposeSwap",
      [path, recipient, large, minOut],
      "success",
    );
    const id2 = await publicClient.readContract({ address: guard, abi: guardAbi, functionName: "proposalCount" });
    await send(`Guardian vetoes proposal #${id2}`, guardian, "vetoSwap", [id2], "success");
    await send(
      `Execute vetoed proposal #${id2} is refused`,
      executor,
      "executeSwap",
      [id2, path, deadline()],
      "reverted",
    );
  } else {
    console.log("Skipping the approval lane (set APPROVER_PRIVATE_KEY and deploy with TREASURY_APPROVER).");
  }

  // 4. pause blocks swaps; only the admin resumes
  await send("Guardian pauses the treasury", guardian, "pause", [], "success");
  await send(
    "Swap while paused is refused",
    executor,
    "swapHbarForToken",
    [path, recipient, small, 1n, deadline()],
    "reverted",
  );
  await send("Admin unpauses the treasury", admin, "unpause", [], "success");

  console.log("\n| Step | Expected | Result | HashScan |\n| --- | --- | --- | --- |");
  for (const row of evidence) {
    console.log(`| ${row.label} | ${row.expect} | ${row.outcome} | [tx](${link(row.hash)}) |`);
  }
  if (evidence.some(row => row.expect !== row.outcome)) {
    console.error("\nAt least one step did not behave as expected. Do not publish this table.");
    process.exit(2);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
