import { SAUCERSWAP_TESTNET } from "./addresses";
import { DEFAULT_SWAP_POLICY, applySlippage, evaluateSwapPolicy } from "./policy";
import { describe, expect, it } from "vitest";

const allowed = SAUCERSWAP_TESTNET.sauce;

describe("evaluateSwapPolicy", () => {
  it("accepts an in-range HBAR→SAUCE swap", () => {
    const result = evaluateSwapPolicy({
      amountInTinybars: 100_000_000n,
      slippageBps: 100,
      tokenOut: allowed,
    });
    expect(result).toEqual({ ok: true });
  });

  it("rejects amounts below the minimum", () => {
    const result = evaluateSwapPolicy({
      amountInTinybars: DEFAULT_SWAP_POLICY.minAmountTinybars - 1n,
      slippageBps: 50,
      tokenOut: allowed,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("AMOUNT_TOO_LOW");
  });

  it("rejects amounts above the maximum", () => {
    const result = evaluateSwapPolicy({
      amountInTinybars: DEFAULT_SWAP_POLICY.maxAmountTinybars + 1n,
      slippageBps: 50,
      tokenOut: allowed,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("AMOUNT_TOO_HIGH");
  });

  it("rejects slippage above the policy cap", () => {
    const result = evaluateSwapPolicy({
      amountInTinybars: 100_000_000n,
      slippageBps: DEFAULT_SWAP_POLICY.maxSlippageBps + 1,
      tokenOut: allowed,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("SLIPPAGE_TOO_HIGH");
  });

  it("rejects tokens outside the allowlist", () => {
    const result = evaluateSwapPolicy({
      amountInTinybars: 100_000_000n,
      slippageBps: 50,
      tokenOut: "0x0000000000000000000000000000000000000001",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("TOKEN_NOT_ALLOWED");
  });
});

describe("applySlippage", () => {
  it("reduces amountOut by the requested basis points", () => {
    expect(applySlippage(10_000n, 100)).toBe(9_900n);
  });

  it("returns zero for non-positive amounts", () => {
    expect(applySlippage(0n, 100)).toBe(0n);
  });
});
