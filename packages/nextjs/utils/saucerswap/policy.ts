import { hederaNumToAddress } from "./addresses";
import { parseHbarToTinybars } from "./amounts";
import { TREASURY_CONFIG, tokenIdToNum } from "./treasuryConfig";
import type { Address } from "viem";

export type SwapPolicyInput = {
  /** Exact HBAR input in tinybars (8 decimals). */
  amountInTinybars: bigint;
  /** Slippage tolerance in basis points (100 = 1%). */
  slippageBps: number;
  /** EVM address of the output token. */
  tokenOut: Address;
};

export type SwapPolicyResult = { ok: true } | { ok: false; reason: string; code: SwapPolicyCode };

export type SwapPolicyCode = "AMOUNT_TOO_LOW" | "AMOUNT_TOO_HIGH" | "SLIPPAGE_TOO_HIGH" | "TOKEN_NOT_ALLOWED";

export type SwapPolicyLimits = {
  /** Minimum HBAR in tinybars. */
  minAmountTinybars: bigint;
  /** Maximum HBAR in tinybars. */
  maxAmountTinybars: bigint;
  /** Maximum slippage in basis points. */
  maxSlippageBps: number;
  /** Allowed output token addresses (lowercase). */
  allowedTokenOut: ReadonlySet<string>;
};

/** Defaults come from `treasury.config.json`, the same file the deploy script reads. */
export const DEFAULT_SWAP_POLICY: SwapPolicyLimits = {
  minAmountTinybars: parseHbarToTinybars(TREASURY_CONFIG.limits.minHbarPerSwap),
  maxAmountTinybars: parseHbarToTinybars(TREASURY_CONFIG.limits.maxHbarPerSwap),
  maxSlippageBps: TREASURY_CONFIG.browser.maxSlippageBps,
  allowedTokenOut: new Set(
    TREASURY_CONFIG.tokens.map(token => hederaNumToAddress(tokenIdToNum(token.tokenId)).toLowerCase()),
  ),
};

/**
 * Pure policy gate for a proposed SaucerSwap. Deterministic — same input, same verdict.
 */
export function evaluateSwapPolicy(
  input: SwapPolicyInput,
  limits: SwapPolicyLimits = DEFAULT_SWAP_POLICY,
): SwapPolicyResult {
  if (input.amountInTinybars < limits.minAmountTinybars) {
    return {
      ok: false,
      code: "AMOUNT_TOO_LOW",
      reason: `Amount is below the minimum of ${formatTinybars(limits.minAmountTinybars)} HBAR.`,
    };
  }

  if (input.amountInTinybars > limits.maxAmountTinybars) {
    return {
      ok: false,
      code: "AMOUNT_TOO_HIGH",
      reason: `Amount exceeds the policy maximum of ${formatTinybars(limits.maxAmountTinybars)} HBAR.`,
    };
  }

  if (!Number.isFinite(input.slippageBps) || input.slippageBps < 0) {
    return {
      ok: false,
      code: "SLIPPAGE_TOO_HIGH",
      reason: "Slippage must be a non-negative number of basis points.",
    };
  }

  if (input.slippageBps > limits.maxSlippageBps) {
    return {
      ok: false,
      code: "SLIPPAGE_TOO_HIGH",
      reason: `Slippage ${input.slippageBps} bps exceeds the policy maximum of ${limits.maxSlippageBps} bps.`,
    };
  }

  if (!limits.allowedTokenOut.has(input.tokenOut.toLowerCase())) {
    return {
      ok: false,
      code: "TOKEN_NOT_ALLOWED",
      reason: `Output token ${input.tokenOut} is not on the allowlist.`,
    };
  }

  return { ok: true };
}

export function applySlippage(amountOut: bigint, slippageBps: number): bigint {
  if (amountOut <= 0n) return 0n;
  const bps = BigInt(Math.max(0, Math.floor(slippageBps)));
  return (amountOut * (10_000n - bps)) / 10_000n;
}

export function formatTinybars(tinybars: bigint): string {
  const whole = tinybars / 100_000_000n;
  const frac = (tinybars % 100_000_000n).toString().padStart(8, "0").replace(/0+$/, "");
  return frac.length ? `${whole}.${frac}` : `${whole}`;
}
