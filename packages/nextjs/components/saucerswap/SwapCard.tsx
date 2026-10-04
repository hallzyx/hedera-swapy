"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  requestReceipt,
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
  const [assocTxHash, setAssocTxHash] = useState<Hex | null>(null);
  const [swapTxHash, setSwapTxHash] = useState<Hex | null>(null);
  const receiptSentFor = useRef<Hex | null>(null);
  const lastTxHash = swapTxHash ?? assocTxHash;

  const { sendTransactionAsync, isPending: isSending } = useSendTransaction();
  const { writeContractAsync, isPending: isAssociating } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: swapTxHash ?? undefined,
  });
  const { isLoading: isAssocConfirming, isSuccess: assocConfirmed } = useWaitForTransactionReceipt({
    hash: assocTxHash ?? undefined,
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
    // If the mirror node could not be reached the state is unknown (null), never "not associated".
    setAssociated(result.checked ? result.associated : null);
  }, [address]);

  useEffect(() => {
    void refreshAssociation();
  }, [refreshAssociation]);

  // After the associate tx confirms, poll the mirror node: a confirmed EVM call to the HTS precompile
  // does not by itself prove the association happened.
  useEffect(() => {
    if (!assocConfirmed || !address) return;
    let cancelled = false;
    void (async () => {
      for (let attempt = 0; attempt < 4 && !cancelled; attempt++) {
        const result = await isSauceAssociated(address);
        if (cancelled) return;
        if (result.checked && result.associated) {
          setAssociated(true);
          setStatus("SAUCE associated. You can swap now.");
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 2500));
      }
      if (!cancelled) {
        setStatus(
          "The association transaction confirmed, but SAUCE is not showing on your account yet. Check HashScan, then retry.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assocConfirmed, address]);

  // Write the HCS receipt only once the swap is confirmed on-chain (the server verifies it again).
  useEffect(() => {
    if (!isConfirmed || !swapTxHash || !address || receiptSentFor.current === swapTxHash) return;
    receiptSentFor.current = swapTxHash;
    requestReceipt(swapTxHash);
  }, [isConfirmed, swapTxHash, address]);

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
    !isAssocConfirming &&
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
      setAssocTxHash(hash);
      setSwapTxHash(null);
      setStatus("SAUCE association submitted. Waiting for confirmation…");
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
      // Re-quote right before signing so the slippage floor is based on the current pool price.
      const fresh = await quoteExactInputHbarToSauce(tinybars);
      setQuote({ amountOut: fresh.amountOut, path: fresh.path });
      const call = buildExactInputSwapCall({
        recipient: address,
        path: fresh.path,
        amountInTinybars: tinybars,
        quotedAmountOut: fresh.amountOut,
        slippageBps,
      });
      const hash = await sendTransactionAsync({
        to: call.to,
        data: call.data,
        value: call.value,
        gas: 2_000_000n,
      });
      setSwapTxHash(hash);
      setStatus("Swap submitted. Waiting for confirmation…");
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
            {swapTxHash && isConfirmed && <p className="m-0 text-success">Swap confirmed on Hedera testnet.</p>}
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
