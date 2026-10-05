# Treasury Swap Guard

A [scaffold-hbar](https://docs.hedera.com/solutions/tools/scaffold-hbar) template for **DAO and small-team treasuries on Hedera** that convert HBAR into an operating token (grants, payroll, vendor payments) through **SaucerSwap V2**, inside rules a **smart contract enforces**, with an **HCS audit trail**.

Removing SaucerSwap removes the product: the guard contract's only job is to gate treasury HBAR into the V2 `SwapRouter`.

## Who it is for

Treasurers and ops leads of DAOs, grant programs and small teams who share the same few needs:

| Need | How the template covers it |
| --- | --- |
| Cap what one swap can move, and what a day can move | `minAmountIn`, `maxAmountIn`, `dailyCap` in `TreasuryPolicyGuard` |
| Only convert into approved tokens | per-token allowlist, with a **price floor** (minimum output per HBAR) |
| Tokens may only land on approved accounts | payout-recipient allowlist |
| The person who swaps is not the person who sets the rules | `EXECUTOR_ROLE` swaps, `DEFAULT_ADMIN_ROLE` configures, `GUARDIAN_ROLE` can only pause and veto |
| Large swaps need a second person | approval lane: an executor proposes, an `APPROVER_ROLE` account (never the proposer) signs, a guardian can veto |
| Stop everything fast | `pause()` by a guardian, `unpause()` only by the admin |
| Prove what happened | `SwapExecuted` events plus optional HCS receipts verified against the mirror node |

It is deliberately **not** an AI-agent framework, a merchant checkout or a general DEX UI.

## How it works

```mermaid
flowchart LR
  UI[Next.js UI<br/>quote + pre-flight policy] -->|executor signs| G[TreasuryPolicyGuard<br/>holds HBAR]
  G -->|multicall exactInput + refundETH| R[SaucerSwap V2 SwapRouter]
  R -->|SAUCE| P[Approved payout account]
  G -.->|SwapExecuted event| M[Mirror node]
  UI -->|swap tx hash| A["POST /api/receipts"]
  A -->|verify tx on mirror node| M
  A -->|verified receipt| H[HCS topic]
```

Two layers use the same rules:

1. **Browser pre-flight** (`utils/saucerswap/policy.ts`): pure TypeScript, fast feedback, and the whole app in "UI mode" with no contract.
2. **Contract authority** (`TreasuryPolicyGuard.sol`): the layer that actually holds the funds. Anything the UI allows but the contract rejects simply reverts; the UI dry-runs the call first and names the failed rule.

## One-command scaffold

```bash
npm create scaffold-hbar@latest my-treasury -- --template hallzyx/hedera-swapy
cd my-treasury
yarn install
yarn next:dev
```

Open [http://localhost:3000](http://localhost:3000).

## Prerequisites

- Node.js >= 20.18.3
- Yarn (Corepack: `corepack enable && corepack prepare yarn@stable --activate`)
- A Hedera **testnet** account with HBAR from the [Hedera Portal faucet](https://portal.hedera.com/faucet)
- MetaMask (or another RainbowKit wallet) on **Hedera Testnet** (chain id `296`)

## Check your setup

```bash
yarn doctor
```

Read-only. It checks Node, `treasury.config.json`, your env files, the Hedera testnet RPC and mirror node, and, when a guard address is set, the deployed contract (limits, approval lane, price floors, balance, pause). Pass `SWAP_PRIVATE_KEY` (and optionally `APPROVER_PRIVATE_KEY`, `TREASURY_PAYOUT_ADDRESS`) to also check roles, the payout allowlist and token association. Every problem comes with the command that fixes it. The web app shows the same first-run steps in its **Setup checklist** card.

## Mode 1: UI only (no deploy)

```bash
yarn next:dev
```

Connect a wallet, enter 0.1 to 50 HBAR, confirm the QuoterV2 quote, associate SAUCE if prompted and swap. The browser policy gates the button.

## Mode 2: on-chain treasury guard

```bash
# 1. Create or import a deployer account (encrypted key stored in packages/hardhat/.env)
yarn hardhat:account:generate

# 2. Deploy the guard on Hedera testnet and apply the starter policy
yarn hardhat:deploy --network hederaTestnet --tags TreasuryPolicyGuard
```

The deploy script prints the contract address and a HashScan link. Then:

1. Send testnet HBAR to the guard address (it is the treasury).
2. Associate the payout account with SAUCE (`Associate SAUCE` button, wallet = payout account).
3. Put the address in `packages/nextjs/.env.local`: `NEXT_PUBLIC_TREASURY_GUARD_ADDRESS=0x...`
4. Restart `yarn next:dev`. The **Treasury guard** panel shows the contract's live policy and swaps through it.

Starter policy applied by the script (change it with the admin account at any time):

| Rule | Value |
| --- | --- |
| Per swap | 0.1 to 50 HBAR |
| Per UTC day | 100 HBAR |
| Output token | SAUCE, price floor `TREASURY_MIN_SAUCE_PER_HBAR` (default 30 SAUCE per HBAR) |
| Recipient | `TREASURY_PAYOUT_ADDRESS` (default: deployer) |
| Path | single hop WHBAR -> allowed token |
| Deadline | at most 1 hour ahead |
| Approval lane | off unless `TREASURY_APPROVER` is set; then swaps above `TREASURY_APPROVAL_THRESHOLD_HBAR` (default 10) need 1 approver, proposals expire after 24 h |

To split roles, set `TREASURY_ADMIN` (for example a multisig) and `TREASURY_EXECUTOR` before deploying. When the admin is not the deployer the script only deploys and prints the three admin calls to make.

### One config file for the policy

`treasury.config.json` (repository root) holds the starter policy: per-swap and daily limits, the approval threshold and quorum, the browser slippage cap and the allowed output tokens with their price floors. The deploy script, the browser pre-flight policy (`policy.ts`), the UI checklist and `yarn doctor` all read it, and `treasuryConfig.test.ts` fails if it becomes inconsistent. To adapt the template, edit that file; use the admin setters on an already deployed guard. Adding a token to the config updates the allowlist, but the swap card still quotes WHBAR/SAUCE only (see `AGENTS.md`).

### Contract tests

```bash
yarn hardhat:test:guard   # in-memory chain, no network needed
```

The suite uses a mock router and covers role checks, amount and daily limits (including the UTC-day reset), token and recipient allowlists, path validation, the price floor, deadlines, pause behaviour, failed-router rollback and admin withdrawals.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the flows and [SECURITY.md](SECURITY.md) for what each role can and cannot do.

| Piece | Role |
| --- | --- |
| `packages/hardhat/contracts/TreasuryPolicyGuard.sol` | Treasury + on-chain policy + SaucerSwap call |
| `packages/hardhat/contracts/interfaces/ISaucerSwapRouter.sol` | Minimal router interface |
| `packages/hardhat/contracts/mocks/MockSaucerSwapRouter.sol` | Test-only router |
| `packages/hardhat/deploy/03_deploy_treasury_policy_guard.ts` | Deploy + starter policy |
| `packages/nextjs/utils/saucerswap/quote.ts` | `eth_call` to QuoterV2 `quoteExactInput` |
| `treasury.config.json` | Policy defaults shared by deploy, browser policy, UI and `yarn doctor` |
| `packages/nextjs/utils/saucerswap/policy.ts` | Pure browser policy |
| `packages/nextjs/utils/saucerswap/checklist.ts` | Pure first-run checklist logic |
| `packages/nextjs/components/saucerswap/SetupChecklist.tsx` | First-run checklist card |
| `packages/nextjs/scripts/doctor.mjs` | `yarn doctor` diagnostics |
| `packages/nextjs/utils/saucerswap/association.ts` | Mirror-node association check + HTS associate calldata |
| `packages/nextjs/utils/saucerswap/swap.ts` | Encode `exactInput` + `refundETH` multicall (UI mode) |
| `packages/nextjs/utils/saucerswap/guardAbi.ts` | Guard ABI + readable revert reasons |
| `packages/nextjs/utils/saucerswap/receipt.ts` | Pure mirror-result verification for receipts |
| `packages/nextjs/components/saucerswap/SwapCard.tsx` | UI mode swap card |
| `packages/nextjs/components/saucerswap/TreasuryGuardCard.tsx` | Guard panel: live policy + guarded swap or proposal |
| `packages/nextjs/components/saucerswap/GuardProposals.tsx` | Approve, execute and veto proposals |
| `packages/nextjs/app/api/receipts/route.ts` | Verified, rate-limited HCS receipt writer |

### Testnet addresses (official SaucerSwap deployments)

| Contract / token | Hedera ID | Notes |
| --- | --- | --- |
| QuoterV2 | `0.0.1390002` | Gas-free quotes |
| SwapRouter V2 | `0.0.1414040` | `exactInput` / `multicall` |
| WHBAR | `0.0.15058` | Path uses WHBAR, not native HBAR |
| SAUCE | `0.0.1183558` | Output token (6 decimals) |
| HTS precompile | `0.0.359` / `0x...0167` | `associateToken` |

Pool fee **3000** (0.30%) is the tier that quotes successfully for WHBAR/SAUCE on testnet.

### Decimals gotchas

- Quoter and `exactInput.amountIn`: **tinybars** (8 decimals).
- **Inside the Hedera EVM** (`msg.value`, `address(this).balance`) HBAR is also in tinybars, so the guard forwards `amountIn` as `msg.value` unchanged.
- JSON-RPC (Hashio, viem) accepts and reports **18-decimal weibars** (`tinybars x 10^10`); the UI converts at the edge.
- The price floor is expressed in token smallest units per 1 HBAR (1e8 tinybars).

### Why RainbowKit / wagmi (not HashPack HIP-820)

scaffold-hbar ships RainbowKit + burner for EVM JSON-RPC contract calls. SaucerSwap V2 and the guard are Solidity contracts, so `writeContract` / `sendTransaction` is the native path.

## Environment

Copy the `.env.example` files; never commit secrets.

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_TREASURY_GUARD_ADDRESS` | `packages/nextjs/.env.local` | Enables the guard panel and receipt target |
| `NEXT_PUBLIC_HEDERA_TESTNET_RPC_URL` | `packages/nextjs/.env.local` | Optional Hashio override |
| `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` | `packages/nextjs/.env.local` | RainbowKit WalletConnect |
| `HCS_OPERATOR_ID` / `HCS_OPERATOR_KEY` | server env | Optional HCS receipt writer (pays the fees) |
| `HCS_TOPIC_ID` | server env | Optional receipt topic |
| `TREASURY_ADMIN`, `TREASURY_EXECUTOR`, `TREASURY_GUARDIAN`, `TREASURY_APPROVER`, `TREASURY_APPROVAL_THRESHOLD_HBAR`, `TREASURY_PAYOUT_ADDRESS`, `TREASURY_MIN_SAUCE_PER_HBAR` | shell, at deploy | Starter policy for `yarn hardhat:deploy` |
| `SWAP_PRIVATE_KEY` | shell only | Headless `yarn demo:swap` (UI-mode swap, no guard) and `yarn demo:guard` (executor key) |
| `TREASURY_GUARD_ADDRESS`, `APPROVER_PRIVATE_KEY`, `GUARDIAN_PRIVATE_KEY`, `ADMIN_PRIVATE_KEY` | shell only | `yarn demo:guard`: the last three are optional and default to the executor key (the approver is needed for the approval lane) |

## HCS audit trail (optional)

If `HCS_OPERATOR_ID`, `HCS_OPERATOR_KEY` and `HCS_TOPIC_ID` are set, the UI posts the swap hash **after the transaction confirms**. `POST /api/receipts` then:

1. rejects malformed hashes and more than 10 requests per minute per client,
2. looks the transaction up on the mirror node and requires `SUCCESS` and a call to the SaucerSwap router or the guard,
3. writes the **verified** sender, target and amount to the topic (request-body fields are never trusted) and refuses duplicates.

To create the topic, export `HCS_OPERATOR_ID` and `HCS_OPERATOR_KEY` (ECDSA hex) in your shell and run `yarn hcs:create-topic`. It prints `HCS_TOPIC_ID` and never prints the key; only the operator key can submit to that topic.

The rate limiter and duplicate set live in process memory; use a shared store if you run many serverless instances.

## For coding agents

The repo ships an agent skill, `treasury-swap-guard`, that tells Claude Code, Cursor, Codex or OpenCode which files to touch for each kind of change. `AGENTS.md` points every agent at it at the start of a session. The canonical copy lives in `.agents/skills/`; `yarn skills:sync` mirrors it to `.claude/skills/`. The same agents also get the read-only [Hedera docs MCP server](https://docs.hedera.com/learn/getting-started/mcp-setup) through `.mcp.json`, `.cursor/mcp.json`, `opencode.json` and `.codex/config.toml`.

## Adapting it to your treasury

- **Another output token:** call `setTokenRule(token, true, minOutPerHbar)`, make sure the payout account is associated with it, and re-probe QuoterV2 for the pool fee before relying on a path.
- **Different limits:** `setLimits({minAmountIn, maxAmountIn, dailyCap})` from the admin account.
- **More payout accounts:** `setRecipient(account, true)`.
- **Governance:** make `DEFAULT_ADMIN_ROLE` a multisig; keep `EXECUTOR_ROLE` on the treasurer's hot account.

## Trust model and limits

- Testnet template, not audited. Do not put mainnet funds in it without a review.
- The admin can change every rule and `withdraw` the treasury: the guard limits the **executor**, not the admin.
- Swaps are single-hop WHBAR -> token, exact-input, funded from the treasury balance.
- The price floor is a static rate you set; it is not an oracle.

## Quality commands

```bash
yarn lint
yarn next:check-types
yarn next:test
yarn hardhat:test:guard
yarn next:build
yarn e2e:policy   # Playwright UI checks (no MetaMask)
```

## Testnet evidence

### Treasury guard on Hedera testnet (`yarn demo:guard`, 2026-10-04)

| Field | Value |
| --- | --- |
| Guard contract | [`0xd60fcEEb775d0E034a6013e5a743BFa0B6046870`](https://hashscan.io/testnet/contract/0xd60fcEEb775d0E034a6013e5a743BFa0B6046870) |
| Deploy transaction | [`0x8081244e...f6239f`](https://hashscan.io/testnet/transaction/0x8081244e8a7311d876d99b9826de4aea45abf21e921e22284df5ef9446f6239f) (2,282,774 gas) |
| Sourcify | [exact match (runtime)](https://repo.sourcify.dev/296/0xd60fcEEb775d0E034a6013e5a743BFa0B6046870), verified 2026-10-04 |
| Policy at deploy | 0.1 to 50 HBAR per swap, 100 HBAR per UTC day, SAUCE floor 30 SAUCE per HBAR, swaps above 10 HBAR need 1 approval |
| Executor, guardian, admin, payout | `0x6F21C2155bF93b49348a422A604310F8CCd6ec74` |
| Approver | `0xb9BA204Ef638ecA64c9C8DC975baA9E3f4a4Bf89` |
| Funding | 40 HBAR sent to the guard |

Note: `yarn hardhat:verify:testnet` uses Sourcify's API v1, which has been removed; it returns a 404 and still exits with code 0. The guard above was verified through Sourcify's API v2 instead.

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

UI-mode swap (MetaMask, Hedera testnet). Full table: [TESTNET_EVIDENCE.md](./TESTNET_EVIDENCE.md).

- Transaction: https://hashscan.io/testnet/transaction/0.0.7314364-1790696429-805962774
- Account: `0.0.10778819` (`0x6F21C2155bF93b49348a422A604310F8CCd6ec74`)
- Result: 1 HBAR -> 40.916451 SAUCE

## Licence

MIT, see [LICENCE](./LICENCE).

## Bounty notes

- Eligibility: `template.json`, `README.md`, `AGENTS.md`, install/lint/build, Hedera services in play (HTS association, smart contracts, optional HCS), no committed `.env`
- Ecosystem integration: SaucerSwap V2 is load-bearing (the guard exists to route treasury HBAR into it)
- Hedera depth: Solidity guard + HTS association + SaucerSwap router + HCS verified receipts
