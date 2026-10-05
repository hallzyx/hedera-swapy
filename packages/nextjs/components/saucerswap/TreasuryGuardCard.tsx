"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type Address, BaseError, ContractFunctionRevertedError, type Hex, formatUnits } from "viem";
import {
  useAccount,
  useBalance,
  usePublicClient,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { GuardProposals } from "~~/components/saucerswap/GuardProposals";
import {
  SAUCERSWAP_TESTNET,
  applySlippage,
  describeGuardError,
  formatSauce,
  formatTinybars,
  hashscanTxUrl,
  parseHbarToTinybars,
  quoteExactInputHbarToSauce,
  requestReceipt,
  treasuryGuardAbi,
} from "~~/utils/saucerswap";

const GUARD_ADDRESS = process.env.NEXT_PUBLIC_TREASURY_GUARD_ADDRESS as Address | undefined;
const TINYBARS_PER_HBAR = 100_000_000n;

type TreasuryGuardCardProps = {
  amount: string;
  slippageBps: number;
};

function explain(error: unknown): string {
  if (error instanceof BaseError) {
    const revert = error.walk(e => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) return describeGuardError(revert.data?.errorName);
    return error.shortMessage;
  }
  return error instanceof Error ? error.message : "Swap failed.";
}

/** Shows the on-chain policy of a deployed TreasuryPolicyGuard, or how to deploy one. */
export const TreasuryGuardCard = ({ amount, slippageBps }: TreasuryGuardCardProps) => {
  if (!GUARD_ADDRESS) return <GuardSetupHint />;
  return <GuardPanel guard={GUARD_ADDRESS} amount={amount} slippageBps={slippageBps} />;
};

const GuardSetupHint = () => (
  <div className="bg-base-100 rounded-2xl border border-dashed border-base-300 p-6" data-testid="guard-setup">
    <h3 className="font-bold text-lg mb-2">Treasury guard (on-chain policy)</h3>
    <p className="text-sm text-base-content/70 mt-0">
      The swap card above is checked by a TypeScript policy in the browser. For a DAO or team treasury the same rules
      should live in a contract, so no UI or key can bypass them. Deploy the guard and set its address to enable this
      panel:
    </p>
    <pre className="text-xs bg-base-200 rounded-lg p-3 overflow-x-auto m-0">
      {`yarn hardhat:deploy --network hederaTestnet --tags TreasuryPolicyGuard
# then in packages/nextjs/.env.local
NEXT_PUBLIC_TREASURY_GUARD_ADDRESS=0x...`}
    </pre>
  </div>
);

const GuardPanel = ({ guard, amount, slippageBps }: TreasuryGuardCardProps & { guard: Address }) => {
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient({ chainId: SAUCERSWAP_TESTNET.chainId });
  const { writeContractAsync, isPending } = useWriteContract();
  const [status, setStatus] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash ?? undefined,
  });

  const base = { address: guard, abi: treasuryGuardAbi, chainId: SAUCERSWAP_TESTNET.chainId } as const;

  // Only direct swaps move HBAR in this transaction; a proposal is not a swap yet and gets no receipt.
  const swapHash = useRef<Hex | null>(null);
  useEffect(() => {
    if (isConfirmed && txHash && swapHash.current === txHash) {
      swapHash.current = null;
      requestReceipt(txHash);
    }
  }, [isConfirmed, txHash]);

  const { data: policyData } = useReadContracts({
    contracts: [
      { ...base, functionName: "limits" },
      { ...base, functionName: "paused" },
      { ...base, functionName: "remainingToday" },
      { ...base, functionName: "EXECUTOR_ROLE" },
      { ...base, functionName: "tokenRules", args: [SAUCERSWAP_TESTNET.sauce] },
      { ...base, functionName: "approvalPolicy" },
    ],
    query: { refetchInterval: 15_000 },
  });

  const limits = policyData?.[0]?.result as readonly [bigint, bigint, bigint] | undefined;
  const paused = policyData?.[1]?.result as boolean | undefined;
  const remainingToday = policyData?.[2]?.result as bigint | undefined;
  const executorRole = policyData?.[3]?.result as Hex | undefined;
  const sauceRule = policyData?.[4]?.result as readonly [boolean, bigint] | undefined;
  const approvalPolicy = policyData?.[5]?.result as readonly [bigint, number] | undefined;

  const { data: walletData } = useReadContracts({
    contracts: [
      { ...base, functionName: "hasRole", args: [executorRole as Hex, address as Address] },
      { ...base, functionName: "allowedRecipients", args: [address as Address] },
    ],
    query: { enabled: Boolean(executorRole && address), refetchInterval: 30_000 },
  });
  const isExecutor = walletData?.[0]?.result as boolean | undefined;
  const isRecipient = walletData?.[1]?.result as boolean | undefined;

  // Hashio reports balances in 18-decimal weibars; the contract itself works in tinybars.
  const { data: balance } = useBalance({ address: guard, chainId: SAUCERSWAP_TESTNET.chainId });

  const needsApprovalForAmount = useMemo(() => {
    try {
      return approvalPolicy !== undefined && parseHbarToTinybars(amount) > approvalPolicy[0];
    } catch {
      return false;
    }
  }, [amount, approvalPolicy]);

  const onWrongNetwork = isConnected && chainId !== SAUCERSWAP_TESTNET.chainId;
  const canSwap =
    isConnected &&
    !onWrongNetwork &&
    paused === false &&
    isExecutor === true &&
    isRecipient === true &&
    !isPending &&
    !isConfirming;

  const handleSwap = async () => {
    if (!address || !publicClient) return;
    setStatus(null);
    try {
      const tinybars = parseHbarToTinybars(amount);
      const quote = await quoteExactInputHbarToSauce(tinybars);
      const minOut = applySlippage(quote.amountOut, slippageBps);
      const floor = sauceRule ? (tinybars * sauceRule[1]) / TINYBARS_PER_HBAR : 0n;
      if (minOut < floor) {
        setStatus(
          `Price floor: the contract needs at least ${formatSauce(floor)} SAUCE for this amount, but the current quote with ${slippageBps} bps slippage guarantees ${formatSauce(minOut)}.`,
        );
        return;
      }
      // Above the direct limit the contract only accepts a proposal that a second person approves.
      const needsApproval = approvalPolicy !== undefined && tinybars > approvalPolicy[0];
      // Dry-run first so a rejection is explained before the wallet prompt.
      const submit = async () => {
        if (needsApproval) {
          const call = { ...base, functionName: "proposeSwap", args: [quote.path, address, tinybars, minOut] } as const;
          await publicClient.simulateContract({ ...call, account: address });
          return writeContractAsync({ ...call, gas: 2_000_000n });
        }
        const call = {
          ...base,
          functionName: "swapHbarForToken",
          args: [quote.path, address, tinybars, minOut, BigInt(Math.floor(Date.now() / 1000) + 20 * 60)],
        } as const;
        await publicClient.simulateContract({ ...call, account: address });
        return writeContractAsync({ ...call, gas: 2_000_000n });
      };
      const hash = await submit();
      swapHash.current = needsApproval ? null : hash;
      setTxHash(hash);
      setStatus(
        needsApproval
          ? "Proposal submitted. A second approver has to sign it before it can execute."
          : "Swap submitted through the treasury guard. Waiting for confirmation…",
      );
    } catch (error) {
      setStatus(explain(error));
    }
  };

  return (
    <div className="bg-base-100 rounded-2xl shadow-lg border border-base-300 p-6" data-testid="guard-panel">
      <h3 className="font-bold text-lg mb-1">Treasury guard (on-chain policy)</h3>
      <p className="text-sm text-base-content/70 mt-0 mb-4">
        These rules are enforced by the contract at {guard.slice(0, 8)}…{guard.slice(-6)}. The executor wallet can only
        swap inside them.
      </p>

      <dl className="text-sm grid grid-cols-2 gap-y-2 m-0">
        <dt className="text-base-content/60">Treasury balance</dt>
        <dd className="m-0 text-right font-medium">
          {balance ? `${Number(formatUnits(balance.value, 18)).toLocaleString()} HBAR` : "—"}
        </dd>
        <dt className="text-base-content/60">Per-swap limits</dt>
        <dd className="m-0 text-right font-medium">
          {limits ? `${formatTinybars(limits[0])} – ${formatTinybars(limits[1])} HBAR` : "—"}
        </dd>
        <dt className="text-base-content/60">Left today (cap {limits ? formatTinybars(limits[2]) : "—"})</dt>
        <dd className="m-0 text-right font-medium">
          {remainingToday !== undefined ? `${formatTinybars(remainingToday)} HBAR` : "—"}
        </dd>
        <dt className="text-base-content/60">SAUCE price floor</dt>
        <dd className="m-0 text-right font-medium">
          {sauceRule ? (sauceRule[0] ? `${formatSauce(sauceRule[1])} SAUCE per HBAR` : "token not allowed") : "—"}
        </dd>
        <dt className="text-base-content/60">Second signer needed above</dt>
        <dd className="m-0 text-right font-medium">
          {approvalPolicy && limits
            ? approvalPolicy[0] >= limits[1]
              ? "off"
              : `${formatTinybars(approvalPolicy[0])} HBAR · ${approvalPolicy[1]} approval(s)`
            : "—"}
        </dd>
        <dt className="text-base-content/60">Status</dt>
        <dd className="m-0 text-right font-medium">{paused === undefined ? "—" : paused ? "Paused" : "Active"}</dd>
        <dt className="text-base-content/60">Amount to swap</dt>
        <dd className="m-0 text-right font-medium" data-testid="guard-amount">
          {amount || "—"} HBAR · {slippageBps} bps slippage (set in the swap card above)
        </dd>
        <dt className="text-base-content/60">Your wallet</dt>
        <dd className="m-0 text-right font-medium">
          {!isConnected
            ? "Not connected"
            : `${isExecutor ? "executor" : "not an executor"} · ${isRecipient ? "payout allowed" : "not on payout list"}`}
        </dd>
      </dl>

      <button
        type="button"
        className="btn btn-primary w-full mt-5"
        data-testid="guard-swap-submit"
        disabled={!canSwap}
        onClick={() => void handleSwap()}
      >
        {isPending || isConfirming
          ? "Confirming…"
          : needsApprovalForAmount
            ? "Propose swap for approval"
            : "Swap through the guard"}
      </button>

      <GuardProposals guard={guard} required={approvalPolicy?.[1] ?? 1} />

      {onWrongNetwork && (
        <div className="alert alert-error text-sm mt-3">
          <span>Switch your wallet to Hedera Testnet (chain id 296).</span>
        </div>
      )}

      {(status || txHash) && (
        <div className="rounded-xl border border-base-300 p-4 text-sm space-y-2 mt-4" data-testid="guard-status">
          {status && <p className="m-0">{status}</p>}
          {isConfirmed && <p className="m-0 text-success">Confirmed on Hedera testnet.</p>}
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
