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
  {
    type: "function",
    name: "approvalPolicy",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "threshold", type: "uint256" },
      { name: "required", type: "uint8" },
    ],
  },
  { type: "function", name: "proposalCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "proposals",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      { name: "proposer", type: "address" },
      { name: "recipient", type: "address" },
      { name: "expiresAt", type: "uint64" },
      { name: "approvals", type: "uint8" },
      { name: "status", type: "uint8" },
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMinimum", type: "uint256" },
      { name: "pathHash", type: "bytes32" },
    ],
  },
  {
    type: "function",
    name: "proposeSwap",
    stateMutability: "nonpayable",
    inputs: [
      { name: "path", type: "bytes" },
      { name: "recipient", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMinimum", type: "uint256" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
  {
    type: "function",
    name: "approveSwap",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "vetoSwap",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "executeSwap",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "path", type: "bytes" },
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
  { type: "error", name: "InvalidApprovalPolicy", inputs: [] },
  {
    type: "error",
    name: "ApprovalRequired",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "threshold", type: "uint256" },
    ],
  },
  { type: "error", name: "UnknownProposal", inputs: [{ name: "id", type: "uint256" }] },
  { type: "error", name: "ProposalNotPending", inputs: [{ name: "id", type: "uint256" }] },
  { type: "error", name: "ProposalExpired", inputs: [{ name: "id", type: "uint256" }] },
  { type: "error", name: "SelfApproval", inputs: [{ name: "id", type: "uint256" }] },
  {
    type: "error",
    name: "AlreadyApproved",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "approver", type: "address" },
    ],
  },
  {
    type: "error",
    name: "NotEnoughApprovals",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "approvals", type: "uint8" },
      { name: "required", type: "uint8" },
    ],
  },
  { type: "error", name: "PathMismatch", inputs: [{ name: "id", type: "uint256" }] },
] as const;

/** Function signatures whose successful execution moves treasury HBAR; only these get an HCS receipt. */
export const GUARD_SWAP_SIGNATURES = [
  "swapHbarForToken(bytes,address,uint256,uint256,uint256)",
  "executeSwap(uint256,bytes,uint256)",
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
    case "ApprovalRequired":
      return "This amount is above the direct limit. Propose it and ask an approver to sign off.";
    case "SelfApproval":
      return "The proposer cannot approve their own proposal.";
    case "AlreadyApproved":
      return "This approver has already signed this proposal.";
    case "NotEnoughApprovals":
      return "The proposal does not have enough approvals yet.";
    case "ProposalExpired":
      return "The proposal expired before it was executed.";
    case "ProposalNotPending":
      return "The proposal was already executed or vetoed.";
    case "UnknownProposal":
      return "No proposal with that id.";
    case "PathMismatch":
      return "The path does not match the one committed in the proposal.";
    case "NotGuardian":
      return "Only a guardian or the admin can do this.";
    case "InvalidPath":
      return "The swap path is not a single hop from WHBAR.";
    default:
      return "The treasury contract rejected this swap.";
  }
}
