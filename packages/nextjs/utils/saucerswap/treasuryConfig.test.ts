import { SAUCERSWAP_TESTNET } from "./addresses";
import { parseHbarToTinybars } from "./amounts";
import { DEFAULT_SWAP_POLICY } from "./policy";
import { TREASURY_CONFIG, type TreasuryConfig, tokenIdToNum, validateTreasuryConfig } from "./treasuryConfig";
import { describe, expect, it } from "vitest";

const withLimits = (limits: Partial<TreasuryConfig["limits"]>): TreasuryConfig => ({
  ...TREASURY_CONFIG,
  limits: { ...TREASURY_CONFIG.limits, ...limits },
});

describe("treasury.config.json", () => {
  it("is valid as shipped", () => {
    expect(validateTreasuryConfig(TREASURY_CONFIG)).toEqual([]);
  });

  it("feeds the browser pre-flight policy", () => {
    expect(DEFAULT_SWAP_POLICY.minAmountTinybars).toBe(parseHbarToTinybars(TREASURY_CONFIG.limits.minHbarPerSwap));
    expect(DEFAULT_SWAP_POLICY.maxAmountTinybars).toBe(parseHbarToTinybars(TREASURY_CONFIG.limits.maxHbarPerSwap));
    expect(DEFAULT_SWAP_POLICY.maxSlippageBps).toBe(TREASURY_CONFIG.browser.maxSlippageBps);
  });

  it("allows SAUCE, the token the UI quotes, and matches the fixed testnet id", () => {
    const sauce = TREASURY_CONFIG.tokens.find(token => token.symbol === "SAUCE");
    expect(sauce?.tokenId).toBe(SAUCERSWAP_TESTNET.tokenIds.sauce);
    expect(DEFAULT_SWAP_POLICY.allowedTokenOut.has(SAUCERSWAP_TESTNET.sauce.toLowerCase())).toBe(true);
  });

  it("keeps the approval threshold from exceeding what a single swap may move", () => {
    const threshold = parseHbarToTinybars(TREASURY_CONFIG.approval.thresholdHbar);
    expect(threshold <= DEFAULT_SWAP_POLICY.maxAmountTinybars).toBe(true);
  });
});

describe("validateTreasuryConfig", () => {
  it("flags inverted or oversized limits", () => {
    expect(validateTreasuryConfig(withLimits({ minHbarPerSwap: "60" }))).toContain(
      "minHbarPerSwap must not exceed maxHbarPerSwap.",
    );
    expect(validateTreasuryConfig(withLimits({ dailyCapHbar: "10" }))).toContain(
      "maxHbarPerSwap must not exceed dailyCapHbar.",
    );
  });

  it("flags values that are not decimal strings", () => {
    expect(validateTreasuryConfig(withLimits({ maxHbarPerSwap: "fifty" })).length).toBeGreaterThan(0);
  });

  it("flags bad approval, slippage and token entries", () => {
    const bad: TreasuryConfig = {
      ...TREASURY_CONFIG,
      approval: { ...TREASURY_CONFIG.approval, requiredApprovals: 0 },
      browser: { maxSlippageBps: 20_000 },
      tokens: [{ symbol: "X", tokenId: "1234", decimals: 6, minOutPerHbar: "1.5" }],
    };
    const problems = validateTreasuryConfig(bad);
    expect(problems).toHaveLength(4);
  });

  it("requires at least one token", () => {
    expect(validateTreasuryConfig({ ...TREASURY_CONFIG, tokens: [] })).toContain(
      "At least one output token is required.",
    );
  });
});

describe("tokenIdToNum", () => {
  it("reads the entity number and rejects other shapes", () => {
    expect(tokenIdToNum("0.0.1183558")).toBe(1_183_558);
    expect(() => tokenIdToNum("1183558")).toThrow();
    expect(() => tokenIdToNum("0.0.abc")).toThrow();
  });
});
