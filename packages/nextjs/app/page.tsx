"use client";

import { useState } from "react";
import type { NextPage } from "next";
import { AuditTrail } from "~~/components/saucerswap/AuditTrail";
import { IntentForm } from "~~/components/saucerswap/IntentForm";
import { SetupChecklist } from "~~/components/saucerswap/SetupChecklist";
import { SwapCard } from "~~/components/saucerswap/SwapCard";
import { TreasuryGuardCard } from "~~/components/saucerswap/TreasuryGuardCard";
import { DEFAULT_SWAP_POLICY, SAUCERSWAP_TESTNET, formatTinybars } from "~~/utils/saucerswap";

const Home: NextPage = () => {
  const [amount, setAmount] = useState("1");
  const [slippageBps, setSlippageBps] = useState(100);

  return (
    <div className="flex items-center flex-col grow">
      <div className="hedera-gradient dark:bg-none dark:bg-hedera-charcoal w-full py-12 px-5">
        <div className="flex flex-col items-center max-w-2xl mx-auto text-center gap-3">
          <span className="block text-sm font-medium tracking-widest uppercase text-white/80">
            Scaffold-HBAR template
          </span>
          <h1 className="text-3xl md:text-4xl font-bold text-white m-0">Treasury Swap Guard</h1>
          <p className="text-white/85 m-0 max-w-xl">
            Swap DAO or team treasury HBAR through SaucerSwap V2 inside rules a contract enforces: limits, token and
            payout allowlists, roles, pause, and an HCS audit trail. Hedera testnet.
          </p>
        </div>
      </div>

      <div className="w-full max-w-4xl mx-auto px-5 -mt-8 pb-16 flex flex-col gap-6">
        <SetupChecklist />

        <SwapCard
          amount={amount}
          slippageBps={slippageBps}
          onAmountChange={setAmount}
          onSlippageChange={setSlippageBps}
        />

        <IntentForm
          onApply={(nextAmount, nextSlippage) => {
            setAmount(nextAmount);
            setSlippageBps(nextSlippage);
          }}
        />

        <TreasuryGuardCard amount={amount} slippageBps={slippageBps} />

        <AuditTrail />

        <div className="bg-base-100 rounded-2xl border border-base-300 p-6" data-testid="policy-panel">
          <h3 className="font-bold text-lg mb-3">Browser pre-flight policy</h3>
          <ul className="text-sm space-y-2 m-0 pl-5 list-disc">
            <li>
              Amount between {formatTinybars(DEFAULT_SWAP_POLICY.minAmountTinybars)} and{" "}
              {formatTinybars(DEFAULT_SWAP_POLICY.maxAmountTinybars)} HBAR
            </li>
            <li>
              Slippage at most {DEFAULT_SWAP_POLICY.maxSlippageBps} bps ({DEFAULT_SWAP_POLICY.maxSlippageBps / 100}%)
            </li>
            <li>Output token allowlist: SAUCE ({SAUCERSWAP_TESTNET.tokenIds.sauce})</li>
            <li>Pool fee tier: {SAUCERSWAP_TESTNET.poolFee} (verified via QuoterV2 on testnet)</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Home;
