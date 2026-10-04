"use client";

import { useEffect, useMemo, useState } from "react";
import { type Address, keccak256, stringToHex } from "viem";
import { useAccount, useBalance, useReadContracts } from "wagmi";
import {
  SAUCERSWAP_TESTNET,
  type SauceAssociation,
  buildChecklist,
  isSauceAssociated,
  isSetupComplete,
  treasuryGuardAbi,
} from "~~/utils/saucerswap";

const GUARD_ADDRESS = process.env.NEXT_PUBLIC_TREASURY_GUARD_ADDRESS as Address | undefined;
const EXECUTOR_ROLE = keccak256(stringToHex("EXECUTOR_ROLE"));
const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";
const WEI_PER_TINYBAR = 10n ** 10n;
const ICON = { done: "✓", todo: "○", unknown: "?", info: "i" } as const;

/** First-run checklist: tells a new user exactly what is missing before the first swap. */
export const SetupChecklist = () => {
  const { address, isConnected, chainId } = useAccount();
  const [association, setAssociation] = useState<SauceAssociation>("unknown");

  useEffect(() => {
    if (!address) {
      setAssociation("unknown");
      return;
    }
    let cancelled = false;
    void isSauceAssociated(address).then(result => {
      if (cancelled) return;
      setAssociation(!result.checked ? "unknown" : result.associated ? "associated" : "not-associated");
    });
    return () => {
      cancelled = true;
    };
  }, [address]);

  const guard = GUARD_ADDRESS ?? ZERO_ADDRESS;
  const base = { address: guard, abi: treasuryGuardAbi, chainId: SAUCERSWAP_TESTNET.chainId } as const;
  const wallet = address ?? ZERO_ADDRESS;

  const { data } = useReadContracts({
    contracts: [
      { ...base, functionName: "paused" },
      { ...base, functionName: "limits" },
      { ...base, functionName: "approvalPolicy" },
      { ...base, functionName: "hasRole", args: [EXECUTOR_ROLE, wallet] },
      { ...base, functionName: "allowedRecipients", args: [wallet] },
    ],
    query: { enabled: Boolean(GUARD_ADDRESS), refetchInterval: 20_000 },
  });
  const { data: balance } = useBalance({
    address: GUARD_ADDRESS,
    chainId: SAUCERSWAP_TESTNET.chainId,
    query: { enabled: Boolean(GUARD_ADDRESS) },
  });

  const limits = data?.[1]?.result as readonly [bigint, bigint, bigint] | undefined;
  const approval = data?.[2]?.result as readonly [bigint, number] | undefined;
  const walletKnown = Boolean(address);

  const items = useMemo(
    () =>
      buildChecklist({
        connected: isConnected,
        onTestnet: chainId === SAUCERSWAP_TESTNET.chainId,
        guardConfigured: Boolean(GUARD_ADDRESS),
        sauceAssociation: association,
        guardPaused: data?.[0]?.result as boolean | undefined,
        // Hashio reports weibars (18 decimals); the contract and limits use tinybars (8).
        guardBalanceTinybars: balance ? balance.value / WEI_PER_TINYBAR : undefined,
        minAmountTinybars: limits?.[0],
        isExecutor: walletKnown ? (data?.[3]?.result as boolean | undefined) : undefined,
        isPayoutAllowed: walletKnown ? (data?.[4]?.result as boolean | undefined) : undefined,
        approvalThresholdTinybars: approval?.[0],
        maxAmountTinybars: limits?.[1],
      }),
    [isConnected, chainId, association, data, balance, limits, approval, walletKnown],
  );

  const complete = isSetupComplete(items);
  const actionable = items.filter(item => item.status !== "info");
  const doneCount = actionable.filter(item => item.status === "done").length;

  const list = (
    <ul className="list-none p-0 m-0 space-y-2">
      {items.map(item => (
        <li key={item.id} className="flex gap-3 text-sm" data-testid={`check-${item.id}`} data-status={item.status}>
          <span
            aria-hidden
            className={`w-5 shrink-0 text-center font-bold ${
              item.status === "done" ? "text-success" : item.status === "todo" ? "text-warning" : "text-base-content/50"
            }`}
          >
            {ICON[item.status]}
          </span>
          <span>
            <span className={item.status === "done" ? "" : "font-medium"}>{item.label}</span>
            {item.status !== "done" && item.status !== "info" && item.hint && (
              <span className="block text-base-content/60">{item.hint}</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="bg-base-100 rounded-2xl border border-base-300 p-6" data-testid="setup-checklist">
      {complete ? (
        <details>
          <summary className="cursor-pointer font-bold text-lg">Setup complete ✓</summary>
          <div className="mt-3">{list}</div>
        </details>
      ) : (
        <>
          <h3 className="font-bold text-lg mt-0 mb-1">Setup checklist</h3>
          <p className="text-sm text-base-content/70 mt-0 mb-4">
            {doneCount} of {actionable.length} steps done. Run <code>yarn doctor</code> in the terminal for a deeper
            check of your deployment.
          </p>
          {list}
        </>
      )}
    </div>
  );
};
