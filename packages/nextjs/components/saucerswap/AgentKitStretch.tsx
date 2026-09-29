"use client";

/**
 * Stretch-only panel. Agent Kit chat is intentionally not wired for the bounty
 * critical path — the Intent form covers structured intents without an LLM.
 */
export const AgentKitStretch = () => {
  return (
    <div className="bg-base-100 rounded-2xl border border-dashed border-base-300 p-6" data-testid="agent-kit-stretch">
      <h3 className="font-bold text-lg mb-2">Agent Kit chat (stretch)</h3>
      <p className="text-sm text-base-content/70 m-0">
        Not enabled in this release. Use the Intent form for structured swap intents. A future increment can wrap the
        same policy + SaucerSwap calls with Hedera Agent Kit tools.
      </p>
    </div>
  );
};
