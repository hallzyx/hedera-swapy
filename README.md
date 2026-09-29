# SaucerSwap Policy Swap

A [scaffold-hbar](https://docs.hedera.com/solutions/tools/scaffold-hbar) template for a **load-bearing SaucerSwap V2** integration on **Hedera testnet**.

Users quote **HBAR → SAUCE**, a pure TypeScript **policy** accepts or rejects the proposal, then RainbowKit / wagmi signs:

1. optional **HTS `associateToken`** on precompile `0x167`
2. **SwapRouter `multicall([exactInput, refundETH])`**

Removing SaucerSwap removes the product. That is the ecosystem integration the bounty rubric scores.

## One-command scaffold

```bash
npm create scaffold-hbar@latest my-swap -- --template hallzyx/hedera-swapy
cd my-swap
yarn next:dev
```

Open [http://localhost:3000](http://localhost:3000).

## Prerequisites

- Node.js ≥ 20.18.3
- Yarn (Corepack: `corepack enable && corepack prepare yarn@stable --activate`)
- A Hedera **testnet** account with HBAR from the [Hedera Portal faucet](https://portal.hedera.com/faucet)
- MetaMask (or another RainbowKit wallet) on **Hedera Testnet** (chain id `296`)

No Hardhat deploy is required for the swap demo. The Hardhat workspace remains so the monorepo matches scaffold-hbar / bounty layout.

## Quick start

```bash
yarn install
yarn next:dev
```

1. Connect a wallet on Hedera testnet.
2. Enter an amount between **0.1** and **50** HBAR (policy limits).
3. Confirm the quote (QuoterV2, fee tier **3000**).
4. If prompted, **Associate SAUCE**.
5. **Swap HBAR → SAUCE** and open the HashScan link.

### Headless demo (optional)

```bash
# ECDSA private key for a funded testnet account (never commit it)
SWAP_PRIVATE_KEY=0x... yarn demo:swap
```

The script associates SAUCE if needed, quotes, swaps **1 HBAR**, and prints a HashScan URL.

## Architecture

| Piece | Role |
| --- | --- |
| `utils/saucerswap/quote.ts` | `eth_call` → QuoterV2 `quoteExactInput` |
| `utils/saucerswap/policy.ts` | Pure limits: amount, slippage, token allowlist |
| `utils/saucerswap/association.ts` | Mirror-node association check + HTS associate calldata |
| `utils/saucerswap/swap.ts` | Encode `exactInput` + `refundETH` multicall |
| `components/saucerswap/SwapCard.tsx` | UI + wagmi send |

### Testnet addresses (official SaucerSwap deployments)

| Contract / token | Hedera ID | Notes |
| --- | --- | --- |
| QuoterV2 | `0.0.1390002` | Gas-free quotes |
| SwapRouter V2 | `0.0.1414040` | `exactInput` / `multicall` |
| WHBAR | `0.0.15058` | Path uses WHBAR, not native HBAR |
| SAUCE | `0.0.1183558` | Output token (6 decimals) |
| HTS precompile | `0.0.359` / `0x…0167` | `associateToken` |

Pool fee **3000** (0.30%) is the tier that quotes successfully for WHBAR/SAUCE on testnet (verified during template development).

### Why RainbowKit / wagmi (not HashPack HIP-820)

scaffold-hbar ships RainbowKit + burner for **EVM JSON-RPC** contract calls. SaucerSwap V2 is a Solidity router, so `writeContract` / `sendTransaction` is the native path. HIP-820 HashPack signing is out of scope for this template.

### Amount decimals

- Quoter / `exactInput.amountIn`: **tinybars** (8 decimals)
- `msg.value` on Hashio / viem: **18-decimal wei** (`tinybars × 10^10`)

## Policy

Defaults in `DEFAULT_SWAP_POLICY`:

- Min **0.1 HBAR**, max **50 HBAR**
- Max slippage **500 bps** (5%)
- Output allowlist: SAUCE only

```bash
yarn next:test
```

If the policy rejects, the swap button stays disabled and the UI shows the failing rule.

## Testnet evidence

Verified swap (MetaMask, Hedera testnet). Full table: [TESTNET_EVIDENCE.md](./TESTNET_EVIDENCE.md).

- Transaction: https://hashscan.io/testnet/transaction/0.0.7314364-1790696429-805962774
- Account: `0.0.10778819` (`0x6F21C2155bF93b49348a422A604310F8CCd6ec74`)
- Result: 1 HBAR → 40.916451 SAUCE

Quote probe (no wallet) used during development: **1 HBAR → ~45.73 SAUCE** via QuoterV2 fee 3000.

## Environment

Copy examples; do not commit secrets.

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_HEDERA_TESTNET_RPC_URL` | `packages/nextjs/.env.local` | Optional Hashio override |
| `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` | `packages/nextjs/.env.local` | RainbowKit WalletConnect |
| `SWAP_PRIVATE_KEY` | shell only | Headless `yarn demo:swap` |
| `HCS_OPERATOR_ID` / `HCS_OPERATOR_KEY` | server env | Optional HCS receipt writer |
| `HCS_TOPIC_ID` | server env | Optional receipt topic |

## Optional: HCS receipts

If `HCS_OPERATOR_ID`, `HCS_OPERATOR_KEY`, and `HCS_TOPIC_ID` are set, `POST /api/receipts` appends a compact JSON receipt after a confirmed swap. The UI still works without them.

## Quality commands

```bash
yarn lint
yarn next:check-types
yarn next:test
yarn next:build
yarn e2e:policy   # Playwright UI policy checks (no MetaMask)
```

## Licence

MIT — see [LICENCE](./LICENCE).

## Bounty notes

- Eligibility: `template.json`, `README.md`, `AGENTS.md`, clean install/lint/build, Hedera service in play (HTS associate + SaucerSwap router), no committed `.env`
- Ecosystem integration: SaucerSwap V2 (DEX) is load-bearing
- Hedera depth: HTS association + EVM router on Hedera testnet (+ optional HCS)
