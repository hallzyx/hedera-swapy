import { SAUCERSWAP_TESTNET } from "./addresses";
import { tinybarsToEvmWei } from "./amounts";
import { encodeV2Path } from "./path";
import { buildExactInputSwapCall } from "./swap";
import { describe, expect, it } from "vitest";

describe("buildExactInputSwapCall", () => {
  it("encodes multicall with HBAR value scaled to EVM wei", () => {
    const path = encodeV2Path(SAUCERSWAP_TESTNET.whbar, SAUCERSWAP_TESTNET.poolFee, SAUCERSWAP_TESTNET.sauce);
    const call = buildExactInputSwapCall({
      recipient: "0x00000000000000000000000000000000000000aa",
      path,
      amountInTinybars: 100_000_000n,
      quotedAmountOut: 45_000_000n,
      slippageBps: 100,
      deadline: 1_700_000_000n,
    });

    expect(call.to).toBe(SAUCERSWAP_TESTNET.swapRouter);
    expect(call.value).toBe(tinybarsToEvmWei(100_000_000n));
    expect(call.amountOutMinimum).toBe(44_550_000n);
    expect(call.data.startsWith("0x")).toBe(true);
    expect(call.data.length).toBeGreaterThan(10);
  });
});
