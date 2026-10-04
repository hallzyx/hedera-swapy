# Invariants to keep

## Units
- Inside the Hedera EVM (`msg.value`, `address(this).balance`), the Quoter and router `amountIn`: **tinybars**, 8 decimals.
- JSON-RPC (Hashio, viem `value`, `useBalance`): **weibars**, 18 decimals, tinybars x 10^10.
- SAUCE has 6 decimals. `minOutPerHbar` is SAUCE smallest units per 1 HBAR (1e8 tinybars).
- Convert with `tinybarsToEvmWei` / `parseHbarToTinybars` in `utils/saucerswap/amounts.ts`; do not write ad-hoc math.

## Two policy layers
The contract is the authority. `policy.ts` is fast feedback and the only layer in UI mode. A rule changed in one must change in the other, in their tests, in the deploy defaults and in the README policy table. The browser layer does not model approvals or the daily cap; the contract does.

## Roles
- Executor: swap up to the approval threshold, propose and execute larger swaps.
- Approver: approve once per proposal, never the proposer (`SelfApproval`).
- Guardian: pause and veto (veto works while paused). Cannot unpause.
- Admin: rules, roles, unpause, withdraw. Treat as the treasury key.

## Swap path through the contract
`swapHbarForToken` and `executeSwap` both end in `_execute`: path check, `_enforcePolicy`, `_checkDeadline`, `_recordSpend` (books before the external call), `_routeSwap`, output check. Add new checks inside those small functions, not in the external ones.

## Approval lane
Proposal stores amounts and `keccak256(path)`. `executeSwap` takes the path again and must match. Policy is checked at proposal time and again at execution. Status flips to `Executed` before the router call. Proposals expire after `PROPOSAL_TTL`.

## Receipts
`POST /api/receipts`: rate limit, dedupe, mirror-node lookup, `verifySwapReceipt`, then write. Fields come from the mirror result. Guard calls only qualify for `swapHbarForToken` / `executeSwap` selectors (`GUARD_SWAP_SIGNATURES`), and carry no amount.

## Association
A confirmed call to the HTS precompile does not prove association; re-check the mirror node. If the mirror node is down the state is unknown, not "not associated". The payout account must be associated before a swap or the router transfer reverts.
