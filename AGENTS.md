# Agent instructions

Briefing for coding agents in this app (Cursor, Claude Code, Codex). Claude Code also loads `CLAUDE.md`.

This is a **Scaffold-HBAR** template: Next.js App Router, RainbowKit, Wagmi, Viem, DaisyUI, Hardhat. The product is a **treasury swap guard** for DAOs and small teams: a Solidity contract (`TreasuryPolicyGuard`) holds HBAR and may only spend it through **SaucerSwap V2** (HBAR → allowed token) inside rules the contract enforces, with an optional **HCS** audit trail, on **Hedera testnet**.

Package manager: **Yarn** (`packageManager` in root `package.json`). Prefer `yarn <script>` over npm.

## Audience and boundaries

Target user: a treasurer or ops lead of a DAO or small team converting treasury HBAR into an operating token. Keep every change useful to that person.

**In scope**

- `TreasuryPolicyGuard.sol`: per-swap and daily limits, token allowlist with price floor, payout-recipient allowlist, executor / admin / guardian / approver roles, approval lane (propose, approve, veto, execute), pause
- QuoterV2 `quoteExactInput` (read-only) and SwapRouter V2 `multicall([exactInput, refundETH])`
- Pure browser pre-flight policy in `packages/nextjs/utils/saucerswap/policy.ts`
- HTS `associateToken` via precompile `0x167`
- Verified HCS receipts via server operator keys
- Optional intent form that fills the swap card (no LLM)

**Out of scope**

- AI-agent frameworks, Hedera Agent Kit chat, x402 flows, HashPack / HIP-820 signing
- Merchant checkout, invoices, liquidity provision, multi-hop routes
- Changing the default pair away from WHBAR/SAUCE fee 3000 without re-probing QuoterV2

## Agent skill (load this first)

Before changing anything, load the project skill `treasury-swap-guard` (`.agents/skills/treasury-swap-guard/SKILL.md`). It maps each kind of change (limits, tokens, roles, approval lane, UI, receipts, deploy, docs) to the files, tests and checks involved, with recipes and invariants in `references/`. Cursor, Codex and OpenCode read `.agents/skills/`; Claude Code reads the mirror in `.claude/skills/`. Edit the skill under `.agents/skills/`, then run `yarn skills:sync`; CI runs `yarn skills:check`.

## Hedera docs MCP

`.mcp.json` (Claude Code), `.cursor/mcp.json` (Cursor), `opencode.json` (OpenCode) and `.codex/config.toml` (Codex) register `https://docs.hedera.com/mcp`, a read-only search tool (`SearchHedera`) that needs no keys. Prefer it over memory for Hedera facts. Claude Code asks you to approve project servers once; Codex only loads project config in trusted projects. The Hedera network MCP (it builds transactions for a wallet to sign) is not configured and stays out of scope.

## Two policy layers (keep them in sync)

| Layer | File | Role |
| --- | --- | --- |
| Contract (authority) | `packages/hardhat/contracts/TreasuryPolicyGuard.sol` | Holds funds, rejects anything outside policy |
| Browser (pre-flight) | `packages/nextjs/utils/saucerswap/policy.ts` | Fast feedback; used alone in "UI mode" |

If you change a rule in one, update the other, its tests (`policy.test.ts`, `TreasuryPolicyGuard.test.ts`), `deploy/03_deploy_treasury_policy_guard.ts` defaults and the README policy table. Never arm a swap button when the relevant policy says no.

## Fixed testnet pair

| Role | ID | EVM |
| --- | --- | --- |
| WHBAR | `0.0.15058` | `hederaNumToAddress(15058)` |
| SAUCE | `0.0.1183558` | `hederaNumToAddress(1183558)` |
| QuoterV2 | `0.0.1390002` | |
| SwapRouter | `0.0.1414040` | `0x0000000000000000000000000000000000159398` |
| Fee tier | `3000` | verified live on testnet |

TypeScript addresses live in `packages/nextjs/utils/saucerswap/addresses.ts`; do not hardcode hex elsewhere in the app. The Hardhat deploy script derives the same addresses from the entity numbers.

## Units (the usual source of bugs)

- Quoter, `exactInput.amountIn`, and **everything inside the Hedera EVM** (`msg.value`, `address(this).balance`): **tinybars** (8 decimals)
- JSON-RPC (Hashio, viem `value`, `useBalance`): **18-decimal weibars** = tinybars × 10^10
- SAUCE has 6 decimals; the guard's `minOutPerHbar` is SAUCE smallest units per 1 HBAR (1e8 tinybars)

## Signing model

Use **RainbowKit + wagmi** on chain id **296**.

- Quotes: `publicClient.call` / `eth_call` (no wallet)
- UI mode: `sendTransaction` to the router, `writeContract` for HTS associate
- Guard mode: executor wallet calls `swapHbarForToken` on the guard; the UI runs `simulateContract` first and maps custom errors with `describeGuardError`
- Burner wallet is fine for demos when `enableBurnerWallet` is true
- MetaMask Synpress covers UI + connect; do not require Playwright MCP

## Commands

```bash
yarn next:dev
yarn next:test            # Vitest: policy, swap encoding, receipt verification, rate limiter
yarn hardhat:test:guard   # Hardhat, in-memory chain: TreasuryPolicyGuard + approval lane
yarn next:build
yarn lint
yarn hardhat:deploy --network hederaTestnet --tags TreasuryPolicyGuard
yarn skills:sync          # mirror .agents/skills into .claude/skills (CI: yarn skills:check)
yarn demo:swap            # needs SWAP_PRIVATE_KEY (UI-mode swap, no guard)
yarn demo:guard           # needs TREASURY_GUARD_ADDRESS + SWAP_PRIVATE_KEY (+ APPROVER_PRIVATE_KEY): evidence table
yarn e2e:policy           # Playwright policy UI
yarn e2e:synpress         # Synpress + MetaMask when configured
```

`yarn hardhat:test` (the full suite) forks Hedera testnet and needs network access; `hardhat:test:guard` does not.

## Files to touch first

| Path | Why |
| --- | --- |
| `packages/hardhat/contracts/TreasuryPolicyGuard.sol` | Policy that holds the money |
| `packages/hardhat/test/TreasuryPolicyGuard.test.ts` | Direct-lane contract behaviour |
| `packages/hardhat/test/TreasuryApprovalLane.test.ts` | Propose / approve / veto / execute |
| `packages/hardhat/deploy/03_deploy_treasury_policy_guard.ts` | Starter policy and env vars |
| `packages/nextjs/components/saucerswap/TreasuryGuardCard.tsx` | Guard panel |
| `packages/nextjs/components/saucerswap/SwapCard.tsx` | UI-mode swap |
| `packages/nextjs/utils/saucerswap/*` | Addresses, policy, quote, swap, ABI, receipt verification |
| `packages/nextjs/app/api/receipts/route.ts` | HCS receipt writer |
| `template.json` | scaffold-hbar capabilities |

## Receipts

`POST /api/receipts` must keep verifying the transaction on the mirror node, rate limiting, and deduplicating. Receipt fields come from the verified mirror result, never from the request body. Do not weaken this: the operator account pays for every message.

## Recipes

- **Add an output token:** `setTokenRule(token, true, minOutPerHbar)` from the admin account, associate the payout account with the token, probe QuoterV2 for the fee tier, add it to `DEFAULT_SWAP_POLICY.allowedTokenOut`, add tests.
- **Change a limit:** edit the deploy defaults and `DEFAULT_SWAP_POLICY`, update both test files and the README table.
- **Add a role or rule:** add a custom error, a test for the revert, an entry in `guardAbi.ts` and `describeGuardError`.

## Approval lane

Swaps above `approvalPolicy.threshold` revert with `ApprovalRequired` on the direct path. The flow is `proposeSwap` (executor) -> `approveSwap` (approver, never the proposer) -> `executeSwap` (executor, re-supplies the path, which must match the committed hash). The policy is checked at proposal time and again at execution. A guardian or the admin can `vetoSwap` at any time, even while paused. The browser policy in `policy.ts` does not model approvals; the contract is the only authority for them.

## Gotchas

- A confirmed EVM call to the HTS precompile does not prove association happened; re-check the mirror node.
- If the mirror node is unreachable the association state is **unknown**, not "not associated".
- The payout account must be associated with the output token before a swap, or the router transfer reverts.
- Keep functions in `TreasuryPolicyGuard.sol` small: the Hardhat config does not use `viaIR`, so very large functions hit "stack too deep".

## Secrets

Never commit `.env`, private keys, or operator keys. Use `.env.example` and README tables only.
