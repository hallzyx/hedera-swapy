# Change recipes

## Add an output token
1. Admin calls `setTokenRule(token, true, minOutPerHbar)` (or add it to the deploy script).
2. Associate the payout account with the token (HTS).
3. Probe QuoterV2 for the live fee tier; do not guess it.
4. Add the address to `DEFAULT_SWAP_POLICY.allowedTokenOut` in `policy.ts` and to `addresses.ts`.
5. Tests: `policy.test.ts` (allowed / not allowed), a contract test with the new token.
6. Update the README policy table.

## Change a limit
1. Deploy script defaults and `DEFAULT_SWAP_POLICY` (same numbers; contract uses tinybars).
2. `policy.test.ts` and `TreasuryPolicyGuard.test.ts` (fixture limits if they depend on it).
3. README policy table and `SECURITY.md` if the daily-cap wording changes.

## Add a contract rule
1. Add `error NewRule(...)` and a small private function; call it from `_execute` or `_enforcePolicy`.
2. Add the error to `treasuryGuardAbi` and a case in `describeGuardError` (`utils/saucerswap/guardAbi.ts`).
3. Add a revert test (`.to.be.revertedWithCustomError(guard, "NewRule")`).
4. If it has a browser equivalent, add it to `policy.ts` with a test.
5. Run `yarn hardhat:test:guard`; watch for "stack too deep" and split the function if it appears.

## Add a role
1. `bytes32 public constant X_ROLE = keccak256("X_ROLE");` and `onlyRole(X_ROLE)` on the function.
2. Deploy script: env var (`TREASURY_X`) and `grantRole`.
3. UI: compute the hash with `keccak256(stringToHex("X_ROLE"))` and read `hasRole`.
4. `SECURITY.md` role table and a test for both allowed and refused callers.

## Change approval threshold or quorum
1. Admin calls `setApprovalPolicy(threshold, required)` (`required` >= 1; `type(uint256).max` disables the lane).
2. Deploy defaults: `TREASURY_APPROVER`, `TREASURY_APPROVAL_THRESHOLD_HBAR`.
3. Update `TreasuryApprovalLane.test.ts` and the README row.

## Add a UI action that calls the guard
1. Add the function to `guardAbi.ts` (inputs and outputs exactly as in Solidity).
2. `simulateContract` first, then `writeContractAsync`; map reverts through `describeGuardError`.
3. Pass `gas` explicitly (Hedera estimation is unreliable for these calls).
4. Send a receipt only for calls that move HBAR (`requestReceipt`).

## Add a Hedera service (HSS, oracle, etc.)
Keep it behind a small module in `utils/saucerswap/` or a new contract, add a README section and a test, and do not change the default pair without re-probing QuoterV2.
