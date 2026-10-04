import { type ChecklistState, buildChecklist, isSetupComplete } from "./checklist";
import { describe, expect, it } from "vitest";

const HBAR = 100_000_000n;

const ready: ChecklistState = {
  connected: true,
  onTestnet: true,
  guardConfigured: true,
  sauceAssociation: "associated",
  guardPaused: false,
  guardBalanceTinybars: 100n * HBAR,
  minAmountTinybars: HBAR / 10n,
  isExecutor: true,
  isPayoutAllowed: true,
  approvalThresholdTinybars: 10n * HBAR,
  maxAmountTinybars: 50n * HBAR,
};

const statusOf = (state: ChecklistState, id: string) => buildChecklist(state).find(item => item.id === id)?.status;

describe("buildChecklist", () => {
  it("is complete when everything is in place", () => {
    const items = buildChecklist(ready);
    expect(isSetupComplete(items)).toBe(true);
    expect(statusOf(ready, "approval")).toBe("info");
  });

  it("starts with wallet, network, association and guard for a visitor with nothing set up", () => {
    const state: ChecklistState = {
      connected: false,
      onTestnet: false,
      guardConfigured: false,
      sauceAssociation: "unknown",
    };
    const items = buildChecklist(state);
    expect(items.map(item => item.id)).toEqual(["wallet", "network", "association", "guard"]);
    expect(statusOf(state, "wallet")).toBe("todo");
    expect(statusOf(state, "network")).toBe("unknown");
    expect(statusOf(state, "guard")).toBe("todo");
    expect(isSetupComplete(items)).toBe(false);
  });

  it("flags the wrong network", () => {
    expect(statusOf({ ...ready, onTestnet: false }, "network")).toBe("todo");
  });

  it("asks for association only when the mirror node says it is missing", () => {
    expect(statusOf({ ...ready, sauceAssociation: "not-associated" }, "association")).toBe("todo");
    expect(statusOf({ ...ready, sauceAssociation: "unknown" }, "association")).toBe("unknown");
  });

  it("treats a balance below the minimum swap as not funded, and an unread one as unknown", () => {
    expect(statusOf({ ...ready, guardBalanceTinybars: 0n }, "funded")).toBe("todo");
    expect(statusOf({ ...ready, guardBalanceTinybars: undefined }, "funded")).toBe("unknown");
  });

  it("reports pause, executor and payout problems", () => {
    expect(statusOf({ ...ready, guardPaused: true }, "active")).toBe("todo");
    expect(statusOf({ ...ready, isExecutor: false }, "executor")).toBe("todo");
    expect(statusOf({ ...ready, isPayoutAllowed: false }, "payout")).toBe("todo");
  });

  it("never reports unknown steps as done", () => {
    expect(isSetupComplete(buildChecklist({ ...ready, isExecutor: undefined }))).toBe(false);
  });

  it("describes the approval lane as off when the threshold is not below the per-swap maximum", () => {
    const items = buildChecklist({ ...ready, approvalThresholdTinybars: 2n ** 255n });
    expect(items.find(item => item.id === "approval")?.label).toBe("Approval lane is off");
  });
});
