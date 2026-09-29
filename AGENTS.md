# Agent instructions

Briefing for coding agents in this app (Cursor, Claude Code, Codex). Claude Code also loads `CLAUDE.md`.

This is a **Scaffold-HBAR** template: Next.js App Router, RainbowKit, Wagmi, Viem, DaisyUI, Hardhat workspace present for monorepo shape. The product is a **policy-gated SaucerSwap V2 swap** (HBAR → SAUCE) on **Hedera testnet**.

Package manager: **Yarn** (`packageManager` in root `package.json`). Prefer `yarn <script>` over npm.

## Product boundaries

**In scope**

- QuoterV2 `quoteExactInput` (read-only)
- Pure policy in `packages/nextjs/utils/saucerswap/policy.ts`
- HTS `associateToken` via precompile `0x167`
- SwapRouter V2 `multicall([exactInput, refundETH])` signed with wagmi
- Optional HCS receipt via server operator keys
- Optional intent form that fills the swap card (no LLM)

**Out of scope**

- HashPack / HIP-820 `hedera_signTransaction`
- x402 partial-sign facilitator flows
- Hedera Agent Kit chat as a required path
- Changing the default pair away from WHBAR/SAUCE fee 3000 without re-probing QuoterV2

## Fixed testnet pair

| Role | ID | EVM |
| --- | --- | --- |
| WHBAR | `0.0.15058` | `hederaNumToAddress(15058)` |
| SAUCE | `0.0.1183558` | `hederaNumToAddress(1183558)` |
| QuoterV2 | `0.0.1390002` | |
| SwapRouter | `0.0.1414040` | |
| Fee tier | `3000` | verified live on testnet |

Addresses live in `packages/nextjs/utils/saucerswap/addresses.ts`. Do not hardcode hex elsewhere.

## Signing model

Use **RainbowKit + wagmi** on chain id **296**.

- Quotes: `publicClient.call` / `eth_call` (no wallet)
- Associate / swap: `writeContract` / `sendTransaction`
- Burner wallet is fine for demos when `enableBurnerWallet` is true
- MetaMask Synpress covers UI + connect; do not require Playwright MCP

Decimals: tinybars (8) for quoter/`amountIn`; EVM `value` is tinybars × `10^10`.

## Commands

```bash
yarn next:dev
yarn next:test
yarn next:build
yarn lint
yarn demo:swap          # needs SWAP_PRIVATE_KEY
yarn e2e:policy         # Playwright policy UI
yarn e2e:synpress       # Synpress + MetaMask when configured
```

Local Hardhat chain is optional for this template; the swap targets **public Hedera testnet**.

## Files to touch first

| Path | Why |
| --- | --- |
| `packages/nextjs/components/saucerswap/SwapCard.tsx` | Main UX |
| `packages/nextjs/utils/saucerswap/*` | Addresses, policy, quote, swap encoding |
| `packages/nextjs/app/page.tsx` | Landing |
| `template.json` | scaffold-hbar capabilities |

## Policy rules

When changing limits, update `DEFAULT_SWAP_POLICY` and the Vitest cases in `policy.test.ts`. Never arm the swap button when `evaluateSwapPolicy` returns `ok: false`.

## Secrets

Never commit `.env`, private keys, or operator keys. Use `.env.example` / README tables only.
