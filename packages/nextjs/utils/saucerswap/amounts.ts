import { SAUCERSWAP_TESTNET } from "./addresses";
import { formatUnits, parseUnits } from "viem";

/** Parse a human HBAR string into tinybars (8 decimals). */
export function parseHbarToTinybars(value: string): bigint {
  const trimmed = value.trim();
  if (!trimmed || Number.isNaN(Number(trimmed))) {
    throw new Error("Enter a valid HBAR amount.");
  }
  return parseUnits(trimmed, SAUCERSWAP_TESTNET.hbarTinybarDecimals);
}

/** Tinybars (8) → EVM wei (18) for msg.value on Hashio / viem. */
export function tinybarsToEvmWei(tinybars: bigint): bigint {
  const scale = 10n ** BigInt(SAUCERSWAP_TESTNET.hbarEvmDecimals - SAUCERSWAP_TESTNET.hbarTinybarDecimals);
  return tinybars * scale;
}

export function formatSauce(amount: bigint): string {
  return formatUnits(amount, SAUCERSWAP_TESTNET.sauceDecimals);
}

export function formatHbarFromTinybars(tinybars: bigint): string {
  return formatUnits(tinybars, SAUCERSWAP_TESTNET.hbarTinybarDecimals);
}
