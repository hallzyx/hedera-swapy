/**
 * ABI for packages/hardhat/contracts/TreasuryPolicyGuard.sol (hand-written so the app compiles
 * before the contract is deployed). Custom errors are included so viem can name a revert.
 */
export const treasuryGuardAbi = [
  {
    type: "function",
    name: "limits",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "minAmountIn", type: "uint256" },
      { name: "maxAmountIn", type: "uint256" },
      { name: "dailyCap", type: "uint256" },
    ],
  },
  { type: "function", name: "paused", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "remainingToday", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "EXECUTOR_ROLE", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  {
    type: "function",
    name: "hasRole",
    stateMutability: "view",
    inputs: [
      { name: "role", type: "bytes32" },
      { name: "account", type: "address" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "allowedRecipients",
    stateMutability: "view",
    inputs: [{ name: "recipient", type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "tokenRules",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [
      { name: "allowed", type: "bool" },
      { name: "minOutPerHbar", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "swapHbarForToken",
    stateMutability: "nonpayable",
    inputs: [
      { name: "path", type: "bytes" },
      { name: "recipient", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMinimum", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
  { type: "error", name: "ZeroAddress", inputs: [] },
  { type: "error", name: "InvalidLimits", inputs: [] },
  { type: "error", name: "NotGuardian", inputs: [] },
  { type: "error", name: "InvalidPath", inputs: [] },
  { type: "error", name: "EnforcedPause", inputs: [] },
  {
    type: "error",
    name: "AccessControlUnauthorizedAccount",
    inputs: [
      { name: "account", type: "address" },
      { name: "neededRole", type: "bytes32" },
    ],
  },
  {
    type: "error",
    name: "AmountOutOfRange",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "minAmountIn", type: "uint256" },
      { name: "maxAmountIn", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "DailyCapExceeded",
    inputs: [
      { name: "requestedTotal", type: "uint256" },
      { name: "dailyCap", type: "uint256" },
    ],
  },
  { type: "error", name: "TokenNotAllowed", inputs: [{ name: "token", type: "address" }] },
  { type: "error", name: "RecipientNotAllowed", inputs: [{ name: "recipient", type: "address" }] },
  {
    type: "error",
    name: "PriceFloorViolated",
    inputs: [
      { name: "amountOutMinimum", type: "uint256" },
      { name: "requiredMinimum", type: "uint256" },
    ],
  },
  { type: "error", name: "DeadlineOutOfRange", inputs: [{ name: "deadline", type: "uint256" }] },
  {
    type: "error",
    name: "InsufficientTreasury",
    inputs: [
      { name: "balance", type: "uint256" },
      { name: "required", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "OutputBelowMinimum",
    inputs: [
      { name: "amountOut", type: "uint256" },
      { name: "amountOutMinimum", type: "uint256" },
    ],
  },
  { type: "error", name: "TransferFailed", inputs: [] },
] as const;

/** Plain-language reasons for the guard's custom errors, shown in the UI. */
export function describeGuardError(name: string | undefined): string {
  switch (name) {
    case "AmountOutOfRange":
      return "Amount is outside the per-swap limits set in the contract.";
    case "DailyCapExceeded":
      return "This swap would exceed the contract's daily cap.";
    case "TokenNotAllowed":
      return "The contract does not allow this output token.";
    case "RecipientNotAllowed":
      return "Your wallet is not on the contract's payout allowlist.";
    case "PriceFloorViolated":
      return "The minimum output is below the contract's price floor for this token.";
    case "DeadlineOutOfRange":
      return "The swap deadline is outside the contract's allowed window.";
    case "InsufficientTreasury":
      return "The treasury does not hold enough HBAR for this swap.";
    case "EnforcedPause":
      return "The treasury is paused by a guardian.";
    case "AccessControlUnauthorizedAccount":
      return "Your wallet does not have the executor role on this treasury.";
    case "InvalidPath":
      return "The swap path is not a single hop from WHBAR.";
    default:
      return "The treasury contract rejected this swap.";
  }
}
