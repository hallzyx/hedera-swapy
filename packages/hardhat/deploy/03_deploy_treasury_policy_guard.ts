import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

import { getDeployGasPrice } from "../utils/getDeployGasPrice";

/** Hedera entity number (0.0.N) as a 20-byte EVM address. */
const evmAddress = (entityNum: number): string => `0x${entityNum.toString(16).padStart(40, "0")}`;

// SaucerSwap V2 on Hedera testnet (see packages/nextjs/utils/saucerswap/addresses.ts).
const SWAP_ROUTER = evmAddress(1_414_040); // 0.0.1414040
const WHBAR = evmAddress(15_058); // 0.0.15058
const SAUCE = evmAddress(1_183_558); // 0.0.1183558

const HBAR = 100_000_000n; // tinybars

/**
 * Deploys TreasuryPolicyGuard and, when the deployer is also the admin, applies a starter policy:
 *  - limits: 0.1 to 50 HBAR per swap, 100 HBAR per UTC day
 *  - SAUCE allowed with a price floor (TREASURY_MIN_SAUCE_PER_HBAR, default 30 SAUCE per HBAR)
 *  - TREASURY_PAYOUT_ADDRESS (default: deployer) allowed as swap recipient
 *  - TREASURY_EXECUTOR (default: deployer) granted EXECUTOR_ROLE
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
  const priceFloor = BigInt(process.env.TREASURY_MIN_SAUCE_PER_HBAR || "30000000"); // 30 SAUCE (6 decimals)
  const gasPrice = await getDeployGasPrice(hre);

  const result = await deploy("TreasuryPolicyGuard", {
    from: deployer,
    args: [admin, SWAP_ROUTER, WHBAR, { minAmountIn: HBAR / 10n, maxAmountIn: 50n * HBAR, dailyCap: 100n * HBAR }],
    log: true,
    autoMine: true,
    gasLimit: "3000000",
    gasPrice,
  });

  if (admin.toLowerCase() !== deployer.toLowerCase()) {
    console.log(
      `Admin is ${admin}, not the deployer. From the admin account, call setTokenRule(${SAUCE}, true, ${priceFloor}), ` +
        `setRecipient(${payout}, true) and grantRole(EXECUTOR_ROLE, ${executor}).`,
    );
    return;
  }

  const tx = { from: deployer, log: true, gasLimit: 1_000_000, gasPrice };
  await execute("TreasuryPolicyGuard", tx, "setTokenRule", SAUCE, true, priceFloor);
  await execute("TreasuryPolicyGuard", tx, "setRecipient", payout, true);
  await execute("TreasuryPolicyGuard", tx, "grantRole", hre.ethers.id("EXECUTOR_ROLE"), executor);

  const network = hre.network.config.chainId === 295 ? "mainnet" : "testnet";
  console.log(`TreasuryPolicyGuard: ${result.address}`);
  console.log(`HashScan: https://hashscan.io/${network}/contract/${result.address}`);
};

deployTreasuryPolicyGuard.tags = ["TreasuryPolicyGuard"];
export default deployTreasuryPolicyGuard;
