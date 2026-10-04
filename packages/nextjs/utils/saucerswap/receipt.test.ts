import { createRateLimiter } from "../rateLimit";
import { SAUCERSWAP_TESTNET } from "./addresses";
import { TX_HASH_RE, verifySwapReceipt } from "./receipt";
import { describe, expect, it } from "vitest";

const router = SAUCERSWAP_TESTNET.swapRouter;
const sender = "0x6F21C2155bF93b49348a422A604310F8CCd6ec74";

describe("verifySwapReceipt", () => {
  it("accepts a successful call to the router and reads fields from the mirror result", () => {
    const verdict = verifySwapReceipt({ result: "SUCCESS", from: sender, to: router, amount: 100_000_000 }, [router]);
    expect(verdict).toEqual({
      ok: true,
      payer: sender.toLowerCase(),
      target: router.toLowerCase(),
      amountInTinybars: "100000000",
    });
  });

  it("accepts the treasury guard as an allowed target, case-insensitively", () => {
    const guard = "0x00000000000000000000000000000000000000Ab";
    const verdict = verifySwapReceipt({ result: "SUCCESS", from: sender, to: guard.toLowerCase(), amount: 1 }, [
      router,
      guard,
    ]);
    expect(verdict.ok).toBe(true);
  });

  it("rejects missing, failed or misdirected transactions", () => {
    expect(verifySwapReceipt(null, [router]).ok).toBe(false);
    expect(verifySwapReceipt({ result: "CONTRACT_REVERT_EXECUTED", from: sender, to: router }, [router]).ok).toBe(false);
    expect(verifySwapReceipt({ result: "SUCCESS", from: sender, to: "0x" + "11".repeat(20) }, [router]).ok).toBe(false);
    expect(verifySwapReceipt({ result: "SUCCESS", to: router }, [router]).ok).toBe(false);
  });
});

describe("TX_HASH_RE", () => {
  it("only matches 32-byte hex hashes", () => {
    expect(TX_HASH_RE.test("0x" + "ab".repeat(32))).toBe(true);
    expect(TX_HASH_RE.test("0x1234")).toBe(false);
    expect(TX_HASH_RE.test("0.0.7314364-1790696429-805962774")).toBe(false);
  });
});

describe("createRateLimiter", () => {
  it("allows up to max hits per window, then resets", () => {
    const limiter = createRateLimiter({ max: 2, windowMs: 1000 });
    expect(limiter.allow("ip", 0)).toBe(true);
    expect(limiter.allow("ip", 10)).toBe(true);
    expect(limiter.allow("ip", 20)).toBe(false);
    expect(limiter.allow("other", 20)).toBe(true);
    expect(limiter.allow("ip", 1000)).toBe(true);
  });
});
