import { expect, test } from "@playwright/test";

/**
 * Synpress / MetaMask wallet path.
 *
 * This file is a Playwright-shaped placeholder that documents the Synpress
 * flow. Full MetaMask automation requires `@synthetixio/synpress` plus a local
 * MetaMask seed (never commit it). Enable with:
 *
 *   yarn e2e:synpress
 *
 * When SYNPRESS_ENABLED is not set, the suite skips so CI stays green without
 * a funded extension profile.
 */
const synpressEnabled = process.env.SYNPRESS_ENABLED === "1";

test.describe("synpress MetaMask swap path", () => {
  test.skip(!synpressEnabled, "Set SYNPRESS_ENABLED=1 with a local Synpress MetaMask profile to run.");

  test("connect MetaMask, see policy accept, arm swap", async ({ page }) => {
    // With Synpress, replace this block with metamask.connectToDapp() and
    // network switching to Hedera Testnet (296) before interacting.
    await page.goto("/");
    await page.getByTestId("swap-amount").fill("1");
    await expect(page.getByTestId("policy-accept")).toBeVisible();
    await expect(page.getByTestId("swap-submit")).toBeVisible();
  });
});
