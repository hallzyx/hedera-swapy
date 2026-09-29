import { describe, expect, it } from "vitest";
import { parseSwapIntent } from "~~/components/saucerswap/IntentForm";

describe("parseSwapIntent", () => {
  it("parses amount and slippage", () => {
    expect(parseSwapIntent("swap 2.5 HBAR to SAUCE slippage 200 bps")).toEqual({
      amount: "2.5",
      slippageBps: 200,
    });
  });

  it("defaults slippage to 100 bps", () => {
    expect(parseSwapIntent("swap 1 hbar for sauce")).toEqual({
      amount: "1",
      slippageBps: 100,
    });
  });

  it("returns null when amount is missing", () => {
    expect(parseSwapIntent("swap sauce please")).toBeNull();
  });
});
