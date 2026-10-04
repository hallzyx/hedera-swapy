"use client";

import { useState } from "react";
import { type Address, BaseError, ContractFunctionRevertedError, type Hex, keccak256, stringToHex } from "viem";
import { useAccount, usePublicClient, useReadContracts, useWriteContract } from "wagmi";
import {
  SAUCERSWAP_TESTNET,
  describeGuardError,
  formatSauce,
  formatTinybars,
  hashscanTxUrl,
  treasuryGuardAbi,
} from "~~/utils/saucerswap";
import { encodeV2Path } from "~~/utils/saucerswap/path";

const MAX_LISTED = 5;
const APPROVER_ROLE = keccak256(stringToHex("APPROVER_ROLE"));
const GUARDIAN_ROLE = keccak256(stringToHex("GUARDIAN_ROLE"));
const EXECUTOR_ROLE = keccak256(stringToHex("EXECUTOR_ROLE"));
const STATUS_LABELS = ["unknown", "pending", "executed", "vetoed"] as const;

type ProposalTuple = readonly [Address, Address, bigint, number, number, bigint, bigint, Hex];
type GuardAction = "approveSwap" | "vetoSwap" | "executeSwap";

function explain(error: unknown): string {
  if (error instanceof BaseError) {
    const revert = error.walk(e => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) return describeGuardError(revert.data?.errorName);
    return error.shortMessage;
  }
  return error instanceof Error ? error.message : "Transaction failed.";
}

/** Latest proposals of the approval lane with approve / execute / veto buttons for the matching roles. */
export const GuardProposals = ({ guard, required }: { guard: Address; required: number }) => {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: SAUCERSWAP_TESTNET.chainId });
  const { writeContractAsync, isPending } = useWriteContract();
  const [message, setMessage] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);

  const base = { address: guard, abi: treasuryGuardAbi, chainId: SAUCERSWAP_TESTNET.chainId } as const;

  const { data: countData, refetch: refetchCount } = useReadContracts({
    contracts: [{ ...base, functionName: "proposalCount" }],
    query: { refetchInterval: 15_000 },
  });
  const count = Number((countData?.[0]?.result as bigint | undefined) ?? 0n);
  const ids = Array.from({ length: Math.min(count, MAX_LISTED) }, (_, i) => BigInt(count - i));

  const { data: proposalData, refetch: refetchProposals } = useReadContracts({
    contracts: ids.map(id => ({ ...base, functionName: "proposals" as const, args: [id] as const })),
    query: { enabled: ids.length > 0, refetchInterval: 15_000 },
  });

  const { data: roleData } = useReadContracts({
    contracts: [APPROVER_ROLE, GUARDIAN_ROLE, EXECUTOR_ROLE].map(role => ({
      ...base,
      functionName: "hasRole" as const,
      args: [role, address as Address] as const,
    })),
    query: { enabled: Boolean(address) },
  });
  const isApprover = roleData?.[0]?.result === true;
  const isGuardian = roleData?.[1]?.result === true;
  const isExecutor = roleData?.[2]?.result === true;

  const run = async (action: GuardAction, id: bigint) => {
    if (!address || !publicClient) return;
    setMessage(null);
    try {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
      const path = encodeV2Path(SAUCERSWAP_TESTNET.whbar, SAUCERSWAP_TESTNET.poolFee, SAUCERSWAP_TESTNET.sauce);
      const call =
        action === "executeSwap"
          ? ({ ...base, functionName: "executeSwap", args: [id, path, deadline] } as const)
          : ({ ...base, functionName: action, args: [id] } as const);

      // Dry-run first so a rejection is explained before the wallet prompt.
      await publicClient.simulateContract({ ...call, account: address });
      const hash = await writeContractAsync({ ...call, gas: 2_000_000n });
      setTxHash(hash);
      setMessage("Submitted. The list refreshes once the transaction is confirmed.");
      void refetchCount();
      void refetchProposals();
    } catch (error) {
      setMessage(explain(error));
    }
  };

  if (count === 0) {
    return (
      <p className="text-sm text-base-content/60 mt-4 mb-0" data-testid="guard-proposals-empty">
        No proposals yet. Swaps above the direct limit are proposed by an executor, approved by a second person and can
        be vetoed by a guardian.
      </p>
    );
  }

  return (
    <div className="mt-5" data-testid="guard-proposals">
      <h4 className="font-semibold text-sm mb-2 mt-0">Proposals needing a second signer</h4>
      <ul className="list-none p-0 m-0 space-y-2">
        {ids.map((id, index) => {
          const proposal = proposalData?.[index]?.result as ProposalTuple | undefined;
          if (!proposal) return null;
          const [proposer, , expiresAt, approvals, status, amountIn, amountOutMinimum] = proposal;
          const pending = STATUS_LABELS[status] === "pending" && expiresAt * 1000n > BigInt(Date.now());
          return (
            <li key={id.toString()} className="rounded-xl border border-base-300 p-3 text-sm">
              <div className="flex justify-between gap-2">
                <span className="font-medium">
                  #{id.toString()} · {formatTinybars(amountIn)} HBAR → min {formatSauce(amountOutMinimum)} SAUCE
                </span>
                <span className="text-base-content/60">
                  {pending ? "pending" : STATUS_LABELS[status] === "pending" ? "expired" : STATUS_LABELS[status]}
                </span>
              </div>
              <div className="text-base-content/60 mt-1">
                {approvals}/{required} approvals · proposed by {proposer.slice(0, 8)}…
              </div>
              {pending && (
                <div className="flex flex-wrap gap-2 mt-2">
                  <button
                    type="button"
                    className="btn btn-xs btn-outline"
                    disabled={!isApprover || isPending}
                    onClick={() => void run("approveSwap", id)}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="btn btn-xs btn-primary"
                    disabled={!isExecutor || approvals < required || isPending}
                    onClick={() => void run("executeSwap", id)}
                  >
                    Execute
                  </button>
                  <button
                    type="button"
                    className="btn btn-xs btn-error btn-outline"
                    disabled={!isGuardian || isPending}
                    onClick={() => void run("vetoSwap", id)}
                  >
                    Veto
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {(message || txHash) && (
        <div className="text-sm mt-3 space-y-1" data-testid="guard-proposals-status">
          {message && <p className="m-0">{message}</p>}
          {txHash && (
            <a className="link link-primary break-all" href={hashscanTxUrl(txHash)} target="_blank" rel="noreferrer">
              View on HashScan
            </a>
          )}
        </div>
      )}
    </div>
  );
};
