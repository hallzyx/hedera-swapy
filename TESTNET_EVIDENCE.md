# Testnet evidence

## Quote probe (no wallet) — completed during development

Command (from `packages/nextjs`):

```text
QuoterV2 0.0.1390002 quoteExactInput
path WHBAR → fee 3000 → SAUCE
amountIn = 100000000 tinybars (1 HBAR)
amountOut ≈ 45730425 (≈ 45.730425 SAUCE)
```

Fee tiers 500 and 10000 reverted; **3000** is the live tier for this pair on testnet.

## Treasury guard on Hedera testnet (`yarn demo:guard`, 2026-10-04)

| Field | Value |
| --- | --- |
| Guard contract | [`0xd60fcEEb775d0E034a6013e5a743BFa0B6046870`](https://hashscan.io/testnet/contract/0xd60fcEEb775d0E034a6013e5a743BFa0B6046870) |
| Deploy transaction | [`0x8081244e...f6239f`](https://hashscan.io/testnet/transaction/0x8081244e8a7311d876d99b9826de4aea45abf21e921e22284df5ef9446f6239f) (2,282,774 gas) |
| Sourcify | [exact match (runtime)](https://repo.sourcify.dev/296/0xd60fcEEb775d0E034a6013e5a743BFa0B6046870), verified 2026-10-04 |
| Policy at deploy | 0.1 to 50 HBAR per swap, 100 HBAR per UTC day, SAUCE floor 30 SAUCE per HBAR, swaps above 10 HBAR need 1 approval |
| Executor, guardian, admin, payout | `0x6F21C2155bF93b49348a422A604310F8CCd6ec74` |
| Approver | `0xb9BA204Ef638ecA64c9C8DC975baA9E3f4a4Bf89` |
| Funding | 40 HBAR sent to the guard |

| Step | Result | HashScan |
| --- | --- | --- |
| Swap of 1 HBAR inside the policy (direct lane) | success | [tx](https://hashscan.io/testnet/transaction/0xa105143fdb9c048e65717fce36a769281ca0359e60dc5f04865f2bc419282969) |
| Swap of 51 HBAR refused (above the direct-lane limit) | reverted | [tx](https://hashscan.io/testnet/transaction/0xb94f0cc0ea1eed636d93368dd33187cae53479a288a1c7e675c08a1f1d940738) |
| Direct swap of 11 HBAR refused (needs approval) | reverted | [tx](https://hashscan.io/testnet/transaction/0xb2c56d8bfcd5957eee5b027ca815ea108d93e7cb85e7d8c06e93b11a8e0f75ff) |
| Executor proposes an 11 HBAR swap (#1) | success | [tx](https://hashscan.io/testnet/transaction/0xadb27395051e39f80515e81f37f7861e6525f41723023e9e04a5ed7dd13d8e78) |
| Approval from the proposer's account refused (it has no approver role) | reverted | [tx](https://hashscan.io/testnet/transaction/0xae5a0eb2add607a50da7b49c4ef206683b8e4bfe993e772153147c1683b015a2) |
| Approver signs proposal #1 | success | [tx](https://hashscan.io/testnet/transaction/0xb9211bd6e7e691f46fa29f185bc88581cb755bebde375581969542236634d9a1) |
| Executor executes proposal #1 | success | [tx](https://hashscan.io/testnet/transaction/0x6adb0274e4e4366ee42d4925b28dd001a212b117ad6348f1478b2ff619b892d8) |
| Executor proposes an 11 HBAR swap (#2) | success | [tx](https://hashscan.io/testnet/transaction/0x097bf1bdf2f5f7d6387b624d8f2be03754a53a9787a94be86bb266830b8d0f4b) |
| Guardian vetoes proposal #2 | success | [tx](https://hashscan.io/testnet/transaction/0xab2c5b1d60f032e6bab5789e025b9a51e662ff8ffde87f8c7aed51908de0b0c1) |
| Executing the vetoed proposal #2 refused | reverted | [tx](https://hashscan.io/testnet/transaction/0x82392afe4662bb78ddda36172d4f7fde66201da9e8efb62adf4baf5c32e64f94) |
| Guardian pauses the treasury | success | [tx](https://hashscan.io/testnet/transaction/0x0ae66fa9b7c415ea431aa32a418b50b31b5e77b22fff32c45f33e453b8aba7fb) |
| Swap while paused refused | reverted | [tx](https://hashscan.io/testnet/transaction/0x5c2885a250f0abd6b5b557b45bcae8601e688724e2605ab863fbf87d258321d0) |
| Admin unpauses the treasury | success | [tx](https://hashscan.io/testnet/transaction/0x640b277730a73c07690b6541063ddeb80e12a2abedd2cc3b5376a2fa3b5cd413) |

All 13 steps behaved as expected (the script exits with an error otherwise). Rows marked `reverted` are mined transactions that HashScan shows as `CONTRACT_REVERT_EXECUTED`; the exact custom-error names (`ApprovalRequired`, `NotEnoughApprovals`, `ProposalNotPending`, `EnforcedPause`, `SelfApproval`, ...) are asserted by the Hardhat tests, not decoded in this table. `SelfApproval` itself is covered by `TreasuryApprovalLane.test.ts`: on testnet the proposer's account has no approver role, so that row shows the role check instead.

## Swap transaction (required for bounty gate)

Signed in the UI with MetaMask on Hedera testnet (chain id 296): Associate SAUCE, then swap 1 HBAR. Mirror node result `SUCCESS`. Account received **40.916451 SAUCE** (`0.0.1183558`).

| Field | Value |
| --- | --- |
| HashScan URL | https://hashscan.io/testnet/transaction/0.0.7314364-1790696429-805962774 |
| Transaction id | `0.0.7314364-1790696429-805962774` |
| Account | `0.0.10778819` (`0x6F21C2155bF93b49348a422A604310F8CCd6ec74`) |
| Router | `0.0.1414040` |
| Amount in | 1 HBAR |
| Amount out | 40.916451 SAUCE |

HTS associate (same account, before the swap): https://hashscan.io/testnet/transaction/0.0.7314364-1790696338-745827431

Do **not** commit private keys.
