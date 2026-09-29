import type { Address } from "viem";

/** Convert a Hedera entity number (shard.realm.num → num) to a 20-byte EVM address. */
export function hederaNumToAddress(entityNum: number | bigint): Address {
  return `0x${BigInt(entityNum).toString(16).padStart(40, "0")}` as Address;
}

/** SaucerSwap V2 + HTS addresses on Hedera testnet (official deployments). */
export const SAUCERSWAP_TESTNET = {
  chainId: 296,
  networkLabel: "Hedera Testnet",
  /** SaucerSwapV2QuoterV2 — 0.0.1390002 */
  quoterV2: hederaNumToAddress(1_390_002),
  /** SaucerSwapV2SwapRouter — 0.0.1414040 */
  swapRouter: hederaNumToAddress(1_414_040),
  /** WHBAR token — 0.0.15058 (use in V2 paths instead of native HBAR) */
  whbar: hederaNumToAddress(15_058),
  /** SAUCE — 0.0.1183558 */
  sauce: hederaNumToAddress(1_183_558),
  /** Hedera Token Service system contract */
  htsPrecompile: "0x0000000000000000000000000000000000000167" as Address,
  /** Pool fee that quotes successfully for WHBAR/SAUCE on testnet */
  poolFee: 3000,
  sauceDecimals: 6,
  /** Protocol tinybar decimals for HBAR amounts in QuoterV2 / exactInput */
  hbarTinybarDecimals: 8,
  /** EVM JSON-RPC value decimals (Hashio / viem) */
  hbarEvmDecimals: 18,
  hashscanBase: "https://hashscan.io/testnet",
  rpcUrl: "https://testnet.hashio.io/api",
  mirrorNodeBase: "https://testnet.mirrornode.hedera.com",
  tokenIds: {
    whbar: "0.0.15058",
    sauce: "0.0.1183558",
    quoterV2: "0.0.1390002",
    swapRouter: "0.0.1414040",
  },
} as const;

export type SaucerSwapTestnetConfig = typeof SAUCERSWAP_TESTNET;
