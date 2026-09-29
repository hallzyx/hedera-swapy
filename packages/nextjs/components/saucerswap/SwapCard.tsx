"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Hex } from "viem";
import { useAccount, useSendTransaction, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import {
  DEFAULT_SWAP_POLICY,
  SAUCERSWAP_TESTNET,
  buildAssociateSauceCall,
  buildExactInputSwapCall,
  evaluateSwapPolicy,
  formatHbarFromTinybars,
  formatSauce,
  formatTinybars,
  hashscanTxUrl,
  isSauceAssociated,
  parseHbarToTinybars,
  quoteExactInputHbarToSauce,
} from "~~/utils/saucerswap";

type QuoteState = {
  amountOut: bigint;
  path: Hex;
};

type SwapCardProps = {
  amount: string;
  slippageBps: number;
  onAmountChange: (value: string) => void;
  onSlippageChange: (value: number) => void;
};

export const SwapCard = ({ amount, slippageBps, onAmountChange, onSlippageChange }: SwapCardProps) => {
  const { address, isConnected, chainId } = useAccount();
  const [quote, setQuote] = useState<QuoteState | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [associated, setAssociated] = useState<boolean | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [lastTxHash, setLastTxHash] = useState<Hex | null>(null);

  const { sendTransactionAsync, isPending: isSending } = useSendTransaction();
  const { writeContractAsync, isPending: isAssociating } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: lastTxHash ?? undefined,
  });

  const tinybars = useMemo(() => {
    try {
      return parseHbarToTinybars(amount);
    } catch {
      return null;
    }
  }, [amount]);

  const policy = useMemo(() => {
    if (tinybars === null) {
      return { ok: false as const, code: "AMOUNT_TOO_LOW" as const, reason: "Enter a valid HBAR amount." };
    }
    return evaluateSwapPolicy({
      amountInTinybars: tinybars,
      slippageBps,
      tokenOut: SAUCERSWAP_TESTNET.sauce,
    });
  }, [tinybars, slippageBps]);

  const refreshAssociation = useCallback(async () => {
    if (!address) {
      setAssociated(null);
      return;
    }
    const result = await isSauceAssociated(address);
    setAssociated(result.associated);
  }, [address]);

  useEffect(() => {
    void refreshAssociation();
  }, [refreshAssociation]);

  const fetchQuote = useCallback(async () => {
    if (tinybars === null || !policy.ok) {
      setQuote(null);
      return;
    }
    setQuoting(true);
    setQuoteError(null);
    try {
      const result = await quoteExactInputHbarToSauce(tinybars);
      setQuote({ amountOut: result.amountOut, path: result.path });
    } catch (error) {
      setQuote(null);
      setQuoteError(error instanceof Error ? error.message : "Quote failed.");
    } finally {
      setQuoting(false);
    }
  }, [tinybars, policy.ok]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void fetchQuote();
    }, 400);
    return () => clearTimeout(handle);
  }, [fetchQuote]);

  const onWrongNetwork = isConnected && chainId !== SAUCERSWAP_TESTNET.chainId;
  const canSwap =
    isConnected &&
    !onWrongNetwork &&
    policy.ok &&
    quote !== null &&
    tinybars !== null &&
    !quoting &&
    !isSending &&
    !isAssociating &&
    !isConfirming;

  const handleAssociate = async () => {
    if (!address) return;
    setStatus(null);
    try {
      const call = buildAssociateSauceCall(address);
      const hash = await writeContractAsync({
        address: call.to,
        abi: [
          {
            type: "function",
            name: "associateToken",
            stateMutability: "nonpayable",
            inputs: [
              { name: "account", type: "address" },
              { name: "token", type: "address" },
            ],
            outputs: [{ name: "responseCode", type: "int64" }],
          },
        ] as const,
        functionName: "associateToken",
        args: [address, SAUCERSWAP_TESTNET.sauce],
      });
      setLastTxHash(hash);
      setStatus("SAUCE association submitted. Wait for confirmation, then swap.");
      setTimeout(() => void refreshAssociation(), 4000);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Association failed.");
    }
  };

  const handleSwap = async () => {
    if (!address || !quote || tinybars === null || !policy.ok) return;
    setStatus(null);
    try {
      if (associated === false) {
        setStatus("Associate SAUCE to your account before swapping.");
        return;
      }
      const call = buildExactInputSwapCall({
        recipient: address,
        path: quote.path,
        amountInTinybars: tinybars,
        quotedAmountOut: quote.amountOut,
        slippageBps,
      });
      const hash = await sendTransactionAsync({
        to: call.to,
        data: call.data,
        value: call.value,
        gas: 2_000_000n,
      });
      setLastTxHash(hash);
      setStatus("Swap submitted. Waiting for confirmation…");
      void fetch("/api/receipts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          swapTxHash: hash,
          payer: address,
          amountInTinybars: tinybars.toString(),
          tokenOut: SAUCERSWAP_TESTNET.tokenIds.sauce,
        }),
      }).catch(() => undefined);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Swap failed.");
    }
  };

  return (
    <div
      className="bg-base-100 rounded-2xl shadow-lg border border-base-300 p-6 w-full max-w-xl mx-auto"
      data-testid="swap-card"
    >
      <div className="flex flex-col gap-1 mb-6">
        <h2 className="text-2xl font-bold m-0">Policy-gated SaucerSwap</h2>
        <p className="text-sm text-base-content/70 m-0">
          Swap HBAR → SAUCE on Hedera testnet through SaucerSwap V2. A TypeScript policy decides whether the swap button
          can be armed.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <label className="form-control w-full">
          <div className="label py-1">
            <span className="label-text font-medium">Amount (HBAR)</span>
            <span className="label-text-alt">max {formatTinybars(DEFAULT_SWAP_POLICY.maxAmountTinybars)} HBAR</span>
          </div>
          <input
            className="input input-bordered w-full"
            data-testid="swap-amount"
            inputMode="decimal"
            value={amount}
            onChange={event => onAmountChange(event.target.value)}
          />
        </label>

        <label className="form-control w-full">
          <div className="label py-1">
            <span className="label-text font-medium">Slippage (bps)</span>
            <span className="label-text-alt">max {DEFAULT_SWAP_POLICY.maxSlippageBps} bps</span>
          </div>
          <input
            className="input input-bordered w-full"
            data-testid="swap-slippage"
            type="number"
            min={0}
            max={DEFAULT_SWAP_POLICY.maxSlippageBps}
            value={slippageBps}
            onChange={event => onSlippageChange(Number(event.target.value))}
          />
        </label>

        <div className="rounded-xl bg-base-200 p-4 text-sm space-y-2" data-testid="swap-quote">
          <div className="flex justify-between">
            <span className="text-base-content/60">Pair</span>
            <span className="font-medium">HBAR → SAUCE</span>
          </div>
          <div className="flex justify-between">
            <span className="text-base-content/60">Pool fee</span>
            <span className="font-medium">{SAUCERSWAP_TESTNET.poolFee / 10000}% </span>
          </div>
          <div className="flex justify-between">
            <span className="text-base-content/60">Quoted out</span>
            <span className="font-medium" data-testid="quote-out">
              {quoting ? "Quoting…" : quote ? `${formatSauce(quote.amountOut)} SAUCE` : "—"}
            </span>
          </div>
          {tinybars !== null && (
            <div className="flex justify-between">
              <span className="text-base-content/60">Exact in</span>
              <span className="font-medium">{formatHbarFromTinybars(tinybars)} HBAR</span>
            </div>
          )}
        </div>

        {!policy.ok ? (
          <div className="alert alert-warning text-sm" data-testid="policy-reject">
            <span>{policy.reason}</span>
          </div>
        ) : (
          <div className="alert alert-success text-sm" data-testid="policy-accept">
            <span>Policy accepted. Connect a Hedera testnet wallet and swap.</span>
          </div>
        )}

        {quoteError && (
          <div className="alert alert-error text-sm">
            <span>{quoteError}</span>
          </div>
        )}

        {onWrongNetwork && (
          <div className="alert alert-error text-sm">
            <span>Switch your wallet to Hedera Testnet (chain id 296).</span>
          </div>
        )}

        {isConnected && associated === false && (
          <button
            type="button"
            className="btn btn-secondary"
            data-testid="associate-sauce"
            disabled={isAssociating}
            onClick={() => void handleAssociate()}
          >
            {isAssociating ? "Associating…" : "Associate SAUCE"}
          </button>
        )}

        <button
          type="button"
          className="btn btn-primary"
          data-testid="swap-submit"
          disabled={!canSwap}
          onClick={() => void handleSwap()}
        >
          {!isConnected
            ? "Connect wallet to swap"
            : isSending || isConfirming
              ? "Confirming…"
              : !policy.ok
                ? "Blocked by policy"
                : "Swap HBAR → SAUCE"}
        </button>

        {(status || lastTxHash) && (
          <div className="rounded-xl border border-base-300 p-4 text-sm space-y-2" data-testid="swap-status">
            {status && <p className="m-0">{status}</p>}
            {isConfirmed && <p className="m-0 text-success">Confirmed on Hedera testnet.</p>}
            {lastTxHash && (
              <a
                className="link link-primary break-all"
                href={hashscanTxUrl(lastTxHash)}
                target="_blank"
                rel="noreferrer"
                data-testid="hashscan-link"
              >
                View on HashScan
              </a>
            )}
          </div>
        )}

        <div className="text-xs text-base-content/50 space-y-1">
          <p className="m-0">
            Router {SAUCERSWAP_TESTNET.tokenIds.swapRouter} · Quoter {SAUCERSWAP_TESTNET.tokenIds.quoterV2}
          </p>
          <p className="m-0">
            WHBAR {SAUCERSWAP_TESTNET.tokenIds.whbar} · SAUCE {SAUCERSWAP_TESTNET.tokenIds.sauce}
          </p>
        </div>
      </div>
    </div>
  );
};
