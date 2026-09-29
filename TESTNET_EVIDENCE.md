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
