# Security model

This document says what each account can do, what it cannot do, and what the contract does **not** protect against. The code is a hackathon template: it has not been audited and runs on Hedera testnet.

## What the contract guarantees

`TreasuryPolicyGuard` holds HBAR and releases it only through `swapHbarForToken` or `executeSwap`. Both end in the same internal function, so every swap passes the same checks, in this order:

1. The path is a single hop that starts at WHBAR.
2. `amountIn` is inside `[minAmountIn, maxAmountIn]`.
3. The output token is allowed and the recipient is on the payout allowlist.
4. `amountOutMinimum` is above zero and not below the token's price floor.
5. The deadline is in the future and at most one hour away.
6. The UTC-day total stays under `dailyCap`, and the treasury holds enough HBAR.
7. The spend is booked **before** the external router call; the call is `nonReentrant`.
8. After the router returns, the output must still be at least `amountOutMinimum`, or the whole transaction reverts.

## Roles

| Role | Can | Cannot |
| --- | --- | --- |
| Executor | Swap inside the policy up to the approval threshold; propose and execute larger swaps | Change any rule, approve its own proposal (the contract rejects `SelfApproval`), pick a recipient or token that is not allowlisted |
| Approver | Approve a pending proposal once | Propose, execute, change rules, veto |
| Guardian | Pause; veto a pending proposal, even while paused | Unpause, change rules, move funds |
| Admin | Set limits, token rules, recipients and the approval policy; grant roles; unpause; withdraw | Nothing is blocked from the admin. Treat this key as the treasury |

## Threat model

| Threat | Result |
| --- | --- |
| Executor key stolen | The attacker can only swap to allowlisted recipients, at or above the price floor, up to the daily cap. Large swaps need a second approver. A guardian can pause. |
| Executor and approver keys both stolen | Same limits, but without the second signature. The daily cap and the guardian pause are the remaining defences. |
| Guardian key stolen | The attacker can pause and veto (denial of service), but cannot unpause, so they cannot restart or redirect anything. The admin recovers by replacing the role. |
| Admin key stolen | Full loss: the admin can change every rule and withdraw. Use a multisig or governance account as admin. |
| Router returns less than expected | The contract reverts the whole swap. |
| Proposal approved, rules changed afterwards | Rules are re-checked at execution, so a removed recipient or token blocks it. |
| Proposal replayed or executed twice | Status moves to `Executed` before the router call, so a second execution reverts. |
| Execution path swapped after approval | The path hash is committed at proposal time and must match. |
| Stale proposal | Expires after 24 hours. |

## Known limits

- **The price floor is a fixed rate, not an oracle.** If SAUCE moves a lot, the admin has to update `minOutPerHbar`. Until then swaps can be too strict or too loose.
- **Approvals are counted per account, not per person.** Giving one human two approver accounts defeats the two-person rule.
- **The daily cap uses UTC days**, so the limit can be used twice around midnight UTC (once before, once after).
- **No timelock on admin changes.** A compromised admin acts immediately.
- **HCS receipts are an audit aid, not a control.** They are written by a server operator account after the mirror node confirms the transaction.
- **The browser policy is a convenience.** Only the contract enforces anything. In UI mode (no guard) nothing on-chain restricts the wallet.
- **Unverified build.** Contract tests run on an in-memory chain with a mock router. Real SaucerSwap behaviour was only exercised in UI mode (see `TESTNET_EVIDENCE.md`).

## Operational advice

- Use different accounts for admin, executor, approver and guardian.
- Keep the guardian on a hot, low-value key; keep the admin on a multisig.
- Associate the payout account with the output token before the first swap, or the router transfer reverts.
- Never commit keys. The receipt writer's operator key lives only in server environment variables.

## Reporting

Open a private security advisory on the GitHub repository.
