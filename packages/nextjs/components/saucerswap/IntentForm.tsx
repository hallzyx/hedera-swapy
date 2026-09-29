"use client";

import { useMemo, useState } from "react";

type IntentFormProps = {
  onApply: (amountHbar: string, slippageBps: number) => void;
};

/**
 * Structured intent without an LLM. Parses "swap X HBAR to SAUCE" style phrases
 * and fills the swap card.
 */
export function parseSwapIntent(text: string): { amount: string; slippageBps: number } | null {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return null;

  const amountMatch = normalized.match(/(\d+(?:\.\d+)?)\s*hbar/);
  if (!amountMatch) return null;

  const slippageMatch = normalized.match(/slippage\s+(\d+)\s*bps/);
  const slippageBps = slippageMatch ? Number(slippageMatch[1]) : 100;

  if (!normalized.includes("sauce") && !normalized.includes("swap")) {
    return null;
  }

  return { amount: amountMatch[1], slippageBps };
}

export const IntentForm = ({ onApply }: IntentFormProps) => {
  const [text, setText] = useState("swap 1 HBAR to SAUCE slippage 100 bps");
  const parsed = useMemo(() => parseSwapIntent(text), [text]);

  return (
    <div className="bg-base-100 rounded-2xl border border-base-300 p-6" data-testid="intent-form">
      <h3 className="font-bold text-lg mb-2">Intent (no LLM)</h3>
      <p className="text-sm text-base-content/70 mb-4">
        Example: <code>swap 1 HBAR to SAUCE slippage 100 bps</code>
      </p>
      <textarea
        className="textarea textarea-bordered w-full mb-3"
        data-testid="intent-input"
        rows={2}
        value={text}
        onChange={event => setText(event.target.value)}
      />
      <button
        type="button"
        className="btn btn-outline btn-sm"
        data-testid="intent-apply"
        disabled={!parsed}
        onClick={() => {
          if (parsed) onApply(parsed.amount, parsed.slippageBps);
        }}
      >
        Fill swap form
      </button>
      {!parsed && text.trim() && (
        <p className="text-xs text-warning mt-2 mb-0" data-testid="intent-error">
          Could not parse. Include an HBAR amount and SAUCE/swap.
        </p>
      )}
    </div>
  );
};
