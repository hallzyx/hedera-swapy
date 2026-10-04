export type ChecklistStatus = "done" | "todo" | "unknown" | "info";

export type ChecklistItem = {
  id: string;
  label: string;
  status: ChecklistStatus;
  /** What to do next. Shown only while the item is not done. */
  hint?: string;
};

export type SauceAssociation = "associated" | "not-associated" | "unknown";

/** Everything the checklist needs. `undefined` means "not read yet", never "no". */
export type ChecklistState = {
  connected: boolean;
  onTestnet: boolean;
  guardConfigured: boolean;
  sauceAssociation: SauceAssociation;
  guardPaused?: boolean;
  guardBalanceTinybars?: bigint;
  minAmountTinybars?: bigint;
  isExecutor?: boolean;
  isPayoutAllowed?: boolean;
  /** Swaps above this many tinybars need a second approver; undefined while loading, max value when off. */
  approvalThresholdTinybars?: bigint;
  maxAmountTinybars?: bigint;
};

const flag = (value: boolean | undefined, doneWhen: boolean): ChecklistStatus =>
  value === undefined ? "unknown" : value === doneWhen ? "done" : "todo";

/** Ordered first-run steps for a person opening the app. Pure, so it can be tested without a wallet. */
export function buildChecklist(state: ChecklistState): ChecklistItem[] {
  const items: ChecklistItem[] = [
    {
      id: "wallet",
      label: "Wallet connected",
      status: state.connected ? "done" : "todo",
      hint: "Connect a wallet (the burner wallet works for demos).",
    },
    {
      id: "network",
      label: "On Hedera testnet (chain 296)",
      status: !state.connected ? "unknown" : state.onTestnet ? "done" : "todo",
      hint: "Switch your wallet to Hedera Testnet.",
    },
    {
      id: "association",
      label: "Account associated with SAUCE",
      status: !state.connected
        ? "unknown"
        : state.sauceAssociation === "associated"
          ? "done"
          : state.sauceAssociation === "not-associated"
            ? "todo"
            : "unknown",
      hint: "Associate SAUCE with the account that receives the tokens (Associate button on the swap card).",
    },
    {
      id: "guard",
      label: "Treasury guard configured",
      status: state.guardConfigured ? "done" : "todo",
      hint:
        "Deploy it with `yarn hardhat:deploy --network hederaTestnet --tags TreasuryPolicyGuard`, then set " +
        "NEXT_PUBLIC_TREASURY_GUARD_ADDRESS. UI mode works without it.",
    },
  ];

  if (!state.guardConfigured) return items;

  const funded =
    state.guardBalanceTinybars === undefined || state.minAmountTinybars === undefined
      ? "unknown"
      : state.guardBalanceTinybars >= state.minAmountTinybars
        ? "done"
        : "todo";

  items.push(
    {
      id: "funded",
      label: "Treasury holds enough HBAR",
      status: funded,
      hint: "Send testnet HBAR to the guard address.",
    },
    {
      id: "active",
      label: "Treasury is not paused",
      status: flag(state.guardPaused, false),
      hint: "A guardian paused it. Only the admin can unpause.",
    },
    {
      id: "executor",
      label: "Your wallet is an executor",
      status: !state.connected ? "unknown" : flag(state.isExecutor, true),
      hint: "Ask the admin to grant EXECUTOR_ROLE to your wallet.",
    },
    {
      id: "payout",
      label: "Your wallet is on the payout allowlist",
      status: !state.connected ? "unknown" : flag(state.isPayoutAllowed, true),
      hint: "Ask the admin to call setRecipient for your wallet.",
    },
  );

  if (state.approvalThresholdTinybars !== undefined && state.maxAmountTinybars !== undefined) {
    const enabled = state.approvalThresholdTinybars < state.maxAmountTinybars;
    items.push({
      id: "approval",
      label: enabled ? "Approval lane is on for large swaps" : "Approval lane is off",
      status: "info",
    });
  }
  return items;
}

/** True when every actionable step is done; unknown steps do not count as done. */
export function isSetupComplete(items: ChecklistItem[]): boolean {
  return items.every(item => item.status === "done" || item.status === "info");
}
