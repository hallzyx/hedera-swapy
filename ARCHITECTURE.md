# Architecture

## Pieces

```mermaid
flowchart LR
  subgraph Browser
    UI["Swap card + guard panel"]
    P["policy.ts (pre-flight)"]
    Q["quote.ts (eth_call)"]
  end
  subgraph Hedera testnet
    G["TreasuryPolicyGuard"]
    R["SaucerSwap V2 SwapRouter"]
    QV["QuoterV2"]
    T["HTS token (SAUCE)"]
  end
  subgraph Server
    API["POST /api/receipts"]
    M["Mirror node"]
    H["HCS topic"]
  end
  UI --> P
  UI --> Q --> QV
  UI -->|"swap / propose / approve / veto / execute"| G
  G -->|"multicall(exactInput, refundETH)"| R --> T
  UI -->|"tx hash"| API
  API -->|"verify result"| M
  API -->|"verified payload"| H
```

The browser policy gives fast feedback. The contract is the authority.

## Direct lane (small swaps)

```mermaid
sequenceDiagram
  participant E as Executor
  participant G as Guard
  participant R as SaucerSwap router
  E->>G: swapHbarForToken(path, recipient, amountIn, minOut, deadline)
  G->>G: threshold, limits, token, recipient, price floor, deadline, daily cap
  G->>R: multicall{value: amountIn}([exactInput, refundETH])
  R-->>G: amountOut
  G->>G: amountOut >= minOut
  G-->>E: SwapExecuted
```

## Approval lane (swaps above the threshold)

```mermaid
stateDiagram-v2
  [*] --> Pending: proposeSwap (executor)
  Pending --> Pending: approveSwap (approver, not the proposer)
  Pending --> Executed: executeSwap (executor, enough approvals)
  Pending --> Vetoed: vetoSwap (guardian or admin)
  Pending --> Expired: 24 h pass
```

The proposal stores the amounts and a hash of the path. `executeSwap` takes the path again, checks the hash, re-runs every policy check and then follows the same route as the direct lane.

## Units

| Where | Unit |
| --- | --- |
| Quoter, router `amountIn`, `msg.value`, `address(this).balance` inside the EVM | tinybars (8 decimals) |
| JSON-RPC (Hashio, viem `value`, `useBalance`) | weibars (18 decimals) = tinybars x 10^10 |
| SAUCE | 6 decimals; `minOutPerHbar` is SAUCE units per 1 HBAR |

## Receipts

`POST /api/receipts` never trusts the request body. It rate-limits, deduplicates, fetches the transaction from the mirror node, checks that it called the router or the guard, and writes the mirror-derived fields to HCS.
