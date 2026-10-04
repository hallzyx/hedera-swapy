import rawConfig from "../../../../treasury.config.json";

export type TreasuryToken = {
  symbol: string;
  /** Hedera token id, `0.0.N`. */
  tokenId: string;
  decimals: number;
  /** Price floor: smallest token units per 1 HBAR, as a decimal string. */
  minOutPerHbar: string;
};

export type TreasuryConfig = {
  limits: { minHbarPerSwap: string; maxHbarPerSwap: string; dailyCapHbar: string };
  approval: { thresholdHbar: string; requiredApprovals: number };
  browser: { maxSlippageBps: number };
  tokens: TreasuryToken[];
};

/** Policy defaults shared by the deploy script, the browser policy, the UI and `yarn doctor`. */
export const TREASURY_CONFIG: TreasuryConfig = rawConfig;

const TOKEN_ID_RE = /^0\.0\.(\d+)$/;

/** Entity number of a `0.0.N` token id. Throws on anything else. */
export function tokenIdToNum(tokenId: string): number {
  const match = TOKEN_ID_RE.exec(tokenId);
  if (!match) throw new Error(`Invalid Hedera token id: ${tokenId}`);
  return Number(match[1]);
}

const DECIMAL_RE = /^\d+(\.\d+)?$/;

/** Human-readable problems with a config, or an empty list when it is usable. */
export function validateTreasuryConfig(config: TreasuryConfig): string[] {
  const problems: string[] = [];
  const { limits, approval, browser, tokens } = config;

  for (const [name, value] of Object.entries({ ...limits, thresholdHbar: approval.thresholdHbar })) {
    if (!DECIMAL_RE.test(value)) problems.push(`${name} must be a positive decimal string, got "${value}".`);
  }
  if (problems.length > 0) return problems;

  const min = Number(limits.minHbarPerSwap);
  const max = Number(limits.maxHbarPerSwap);
  const daily = Number(limits.dailyCapHbar);
  if (max <= 0) problems.push("maxHbarPerSwap must be above zero.");
  if (min > max) problems.push("minHbarPerSwap must not exceed maxHbarPerSwap.");
  if (max > daily) problems.push("maxHbarPerSwap must not exceed dailyCapHbar.");
  if (!Number.isInteger(approval.requiredApprovals) || approval.requiredApprovals < 1) {
    problems.push("requiredApprovals must be a whole number of at least 1.");
  }
  if (!Number.isInteger(browser.maxSlippageBps) || browser.maxSlippageBps < 0 || browser.maxSlippageBps > 10_000) {
    problems.push("maxSlippageBps must be between 0 and 10000.");
  }
  if (tokens.length === 0) problems.push("At least one output token is required.");

  for (const token of tokens) {
    if (!TOKEN_ID_RE.test(token.tokenId)) problems.push(`${token.symbol}: tokenId must look like 0.0.N.`);
    if (!/^\d+$/.test(token.minOutPerHbar)) {
      problems.push(`${token.symbol}: minOutPerHbar must be a whole number string.`);
    }
    if (!Number.isInteger(token.decimals) || token.decimals < 0) problems.push(`${token.symbol}: decimals is invalid.`);
  }
  return problems;
}
