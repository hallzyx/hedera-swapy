import { readFileSync } from "fs";
import { join } from "path";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

import { getDeployGasPrice } from "../utils/getDeployGasPrice";

/** Hedera entity number (0.0.N) as a 20-byte EVM address. */
const evmAddress = (entityNum: number): string => `0x${entityNum.toString(16).padStart(40, "0")}`;

// SaucerSwap V2 on Hedera testnet (see packages/nextjs/utils/saucerswap/addresses.ts).
const SWAP_ROUTER = evmAddress(1_414_040); // 0.0.1414040
const WHBAR = evmAddress(15_058); // 0.0.15058

const TINYBAR_DECIMALS = 8;

type TreasuryToken = { symbol: string; tokenId: string; decimals: number; minOutPerHbar: string };
type TreasuryConfig = {
  limits: { minHbarPerSwap: string; maxHbarPerSwap: string; dailyCapHbar: string };
  approval: { thresholdHbar: string; requiredApprovals: number };
  tokens: TreasuryToken[];
};

/** Policy defaults shared with the browser policy: treasury.config.json at the repository root. */
const loadConfig = (): TreasuryConfig =>
  JSON.parse(readFileSync(join(__dirname, "../../../treasury.config.json"), "utf8")) as TreasuryConfig;

/** `0.0.N` token id as a 20-byte EVM address. */
const tokenAddress = (tokenId: string): string => {
  const match = /^0\.0\.(\d+)$/.exec(tokenId);
  if (!match) throw new Error(`Invalid token id in treasury.config.json: ${tokenId}`);
  return evmAddress(Number(match[1]));
};

/**
 * Deploys TreasuryPolicyGuard and, when the deployer is also the admin, applies the starter policy from
 * treasury.config.json (limits, approval threshold, allowed tokens with price floors):
 *  - TREASURY_MIN_SAUCE_PER_HBAR overrides the SAUCE price floor in the config
 *  - TREASURY_PAYOUT_ADDRESS (default: deployer) allowed as swap recipient
 *  - TREASURY_EXECUTOR (default: deployer) granted EXECUTOR_ROLE
 *  - TREASURY_GUARDIAN (default: deployer) granted GUARDIAN_ROLE (pause and veto)
 *  - TREASURY_APPROVER (optional): granted APPROVER_ROLE and turns on the approval lane for swaps above
 *    TREASURY_APPROVAL_THRESHOLD_HBAR (default: the config). Use a different account than the executor.
 *
 * Run: yarn hardhat:deploy --network hederaTestnet --tags TreasuryPolicyGuard
 * Then send HBAR to the printed address and associate the payout account with SAUCE.
 */
const deployTreasuryPolicyGuard: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, execute } = hre.deployments;

  const admin = process.env.TREASURY_ADMIN || deployer;
  const payout = process.env.TREASURY_PAYOUT_ADDRESS || deployer;
  const executor = process.env.TREASURY_EXECUTOR || deployer;
  const guardian = process.env.TREASURY_GUARDIAN || deployer;
  const approver = process.env.TREASURY_APPROVER;
  const config = loadConfig();
  const { parseUnits } = hre.ethers;
  const hbar = (value: string): bigint => parseUnits(value, TINYBAR_DECIMALS);
  const approvalThreshold = hbar(process.env.TREASURY_APPROVAL_THRESHOLD_HBAR || config.approval.thresholdHbar);
  const requiredApprovals = config.approval.requiredApprovals;
  const tokens = config.tokens.map(token => ({
    ...token,
    address: tokenAddress(token.tokenId),
    floor: BigInt(
      token.symbol === "SAUCE" && process.env.TREASURY_MIN_SAUCE_PER_HBAR
        ? process.env.TREASURY_MIN_SAUCE_PER_HBAR
        : token.minOutPerHbar,
    ),
  }));
  const gasPrice = await getDeployGasPrice(hre);

  const result = await deploy("TreasuryPolicyGuard", {
    from: deployer,
    args: [
      admin,
      SWAP_ROUTER,
      WHBAR,
      {
        minAmountIn: hbar(config.limits.minHbarPerSwap),
        maxAmountIn: hbar(config.limits.maxHbarPerSwap),
        dailyCap: hbar(config.limits.dailyCapHbar),
      },
    ],
    log: true,
    autoMine: true,
    gasLimit: "4500000",
    gasPrice,
  });

  if (admin.toLowerCase() !== deployer.toLowerCase()) {
    console.log(
      `Admin is ${admin}, not the deployer. From the admin account, call ` +
        tokens.map(token => `setTokenRule(${token.address}, true, ${token.floor})`).join(", ") +
        `, setRecipient(${payout}, true), grantRole(EXECUTOR_ROLE, ${executor}), grantRole(GUARDIAN_ROLE, ${guardian})` +
        (approver
          ? ` and grantRole(APPROVER_ROLE, ${approver}) plus setApprovalPolicy(${approvalThreshold}, ${requiredApprovals}).`
          : "."),
    );
    return;
  }

  const tx = { from: deployer, log: true, gasLimit: 1_000_000, gasPrice };
  for (const token of tokens) {
    await execute("TreasuryPolicyGuard", tx, "setTokenRule", token.address, true, token.floor);
  }
  await execute("TreasuryPolicyGuard", tx, "setRecipient", payout, true);
  await execute("TreasuryPolicyGuard", tx, "grantRole", hre.ethers.id("EXECUTOR_ROLE"), executor);
  await execute("TreasuryPolicyGuard", tx, "grantRole", hre.ethers.id("GUARDIAN_ROLE"), guardian);
  if (approver) {
    await execute("TreasuryPolicyGuard", tx, "grantRole", hre.ethers.id("APPROVER_ROLE"), approver);
    await execute("TreasuryPolicyGuard", tx, "setApprovalPolicy", approvalThreshold, requiredApprovals);
  }

  const network = hre.network.config.chainId === 295 ? "mainnet" : "testnet";
  console.log(`TreasuryPolicyGuard: ${result.address}`);
  console.log(`HashScan: https://hashscan.io/${network}/contract/${result.address}`);
};

deployTreasuryPolicyGuard.tags = ["TreasuryPolicyGuard"];
export default deployTreasuryPolicyGuard;
