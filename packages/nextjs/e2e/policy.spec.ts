import { expect, test } from "@playwright/test";

/**
 * Policy / intent UI checks without MetaMask.
 * Synpress MetaMask path lives in e2e/synpress.swap.spec.ts (opt-in).
 */
test.describe("policy-gated swap UI", () => {
  test("rejects amounts above the policy max and enables the button path when valid", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByTestId("swap-card")).toBeVisible();

    await page.getByTestId("swap-amount").fill("999");
    await expect(page.getByTestId("policy-reject")).toBeVisible();
    await expect(page.getByTestId("swap-submit")).toBeDisabled();

    await page.getByTestId("swap-amount").fill("1");
    await expect(page.getByTestId("policy-accept")).toBeVisible();
    await expect(page.getByTestId("quote-out")).not.toHaveText("—", { timeout: 20_000 });

    // Without a connected wallet the CTA stays disabled but is no longer "Blocked by policy".
    await expect(page.getByTestId("swap-submit")).toContainText(/Connect wallet|Swap HBAR/);
  });

  test("intent form fills the swap amount", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("intent-input").fill("swap 2 HBAR to SAUCE slippage 150 bps");
    await page.getByTestId("intent-apply").click();
    await expect(page.getByTestId("swap-amount")).toHaveValue("2");
    await expect(page.getByTestId("swap-slippage")).toHaveValue("150");
  });
});
