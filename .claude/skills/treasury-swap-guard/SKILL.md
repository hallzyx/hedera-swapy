---
name: treasury-swap-guard
description: Map and change-guide for this repo, a Hedera treasury swap guard (TreasuryPolicyGuard.sol + SaucerSwap V2 + Next.js + HCS receipts). Use before editing anything here - changing limits, tokens, roles, the approval lane, the swap UI, receipts or deploy scripts - to find the right files, units, tests and the checks to run.
---

# Treasury Swap Guard: where to change what

A DAO or team treasury holds HBAR in `TreasuryPolicyGuard`, which can only spend it through SaucerSwap V2 (HBAR -> allowed token) inside rules the contract enforces. Hedera testnet, chain id 296. Package manager: Yarn. Read `AGENTS.md` first for the fixed testnet pair and boundaries; this skill is the task-to-file map.

## Start here

1. Name the layer you are touching: contract, browser pre-flight, UI, receipts, deploy, docs.
2. Find the task in the table below and open only those files.
3. Make the change, update the paired test, run the checks at the bottom.
4. Open `references/change-recipes.md` for step-by-step recipes and `references/invariants.md` before touching units, roles, receipts or the approval lane.

## Task map

| Task | Edit | Also update |
| --- | --- | --- |
| Change per-swap or daily limits | `deploy/03_deploy_treasury_policy_guard.ts`, `DEFAULT_SWAP_POLICY` in `utils/saucerswap/policy.ts` | `policy.test.ts`, `TreasuryPolicyGuard.test.ts`, README policy table |
| Add an output token | `setTokenRule` call in the deploy script, `allowedTokenOut` in `policy.ts` | associate the payout account (HTS), probe QuoterV2 fee tier, tests |
| Change the price floor | `TREASURY_MIN_SAUCE_PER_HBAR` default in the deploy script | README table; floor is SAUCE units per 1 HBAR |
| Add or change a contract rule | `contracts/TreasuryPolicyGuard.sol` (custom error + small private function) | `guardAbi.ts` (error entry + `describeGuardError`), a revert test |
| Change the approval lane (threshold, quorum, TTL, veto) | `TreasuryPolicyGuard.sol` (`approvalPolicy`, `PROPOSAL_TTL`, propose/approve/veto/execute) | `TreasuryApprovalLane.test.ts`, `guardAbi.ts`, `GuardProposals.tsx`, SECURITY.md |
| Add a role | `TreasuryPolicyGuard.sol` constant + `onlyRole` | deploy script env var, `SECURITY.md` role table, role check in `GuardProposals.tsx` if the UI shows it |
| Change what the guard panel shows or sends | `components/saucerswap/TreasuryGuardCard.tsx` | `guardAbi.ts` if the ABI changed; Playwright `e2e/policy.spec.ts` |
| Proposals list and Approve / Execute / Veto buttons | `components/saucerswap/GuardProposals.tsx` | `guardAbi.ts` |
| UI-mode swap (no guard) | `components/saucerswap/SwapCard.tsx`, `utils/saucerswap/swap.ts`, `quote.ts` | `swap.test.ts` |
| Browser pre-flight rules | `utils/saucerswap/policy.ts` | `policy.test.ts`; keep in sync with the contract |
| Intent form (no LLM) | `components/saucerswap/IntentForm.tsx`, `utils/saucerswap/intent.ts` | `intent.test.ts` |
| HCS receipts (writer, verification, rate limit) | `app/api/receipts/route.ts`, `utils/saucerswap/receipt.ts`, `utils/rateLimit.ts` | `receipt.test.ts`; never trust the request body |
| Audit panel | `components/saucerswap/AuditTrail.tsx` | `GET` in `receipts/route.ts` |
| HTS association | `utils/saucerswap/association.ts` | mirror node is the source of truth |
| Addresses / fee tier | `utils/saucerswap/addresses.ts` | the deploy script derives the same IDs; re-probe QuoterV2 before changing the pair |
| Deploy, starter roles, env vars | `deploy/03_deploy_treasury_policy_guard.ts` | README env table, `.env.example` |
| Evidence for the submission | `yarn demo:guard` | paste its table into README "Testnet evidence" |
| Docs | `README.md`, `SECURITY.md`, `ARCHITECTURE.md`, `AGENTS.md`, `template.json` | keep policy values identical everywhere |

Paths above are relative to `packages/nextjs/` for `utils/`, `components/`, `app/` and `e2e/`, and to `packages/hardhat/` for `contracts/`, `deploy/` and `test/`.

## Do not

- Hardcode addresses outside `addresses.ts` or the deploy script.
- Arm a swap button when the policy says no.
- Add AI-agent frameworks, x402, HashPack signing, multi-hop routes or liquidity provision (out of scope).
- Move to `viaIR`; keep contract functions small instead (stack too deep).
- Commit `.env`, private keys or operator keys.
- Remove or weaken receipt verification: the operator account pays for every message.

## Checks before you finish

```bash
yarn format
yarn hardhat:test:guard     # contract tests, in-memory chain
yarn next:test              # policy, swap encoding, receipts, rate limiter
yarn lint && yarn next:check-types
yarn next:build
yarn skills:check           # after editing this skill, run yarn skills:sync first
```

`yarn hardhat:test` forks testnet and needs network; the guard tests do not.
