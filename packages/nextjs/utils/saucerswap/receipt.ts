/** Subset of the mirror node `GET /api/v1/contracts/results/{hash}` response used for verification. */
export type MirrorContractResult = {
  result?: string;
  from?: string;
  to?: string;
  amount?: number | string | null;
};

export type ReceiptVerification =
  | { ok: true; payer: string; target: string; amountInTinybars: string }
  | { ok: false; reason: string };

export const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

/**
 * Decide whether a mirror-node contract result is a successful call to one of the contracts this
 * template writes receipts for (the SaucerSwap router, or the optional TreasuryPolicyGuard).
 *
 * Receipt fields must come from this verified result, never from the request body.
 */
export function verifySwapReceipt(
  result: MirrorContractResult | null | undefined,
  allowedTargets: readonly string[],
): ReceiptVerification {
  if (!result) return { ok: false, reason: "Transaction not found on the mirror node." };
  if (result.result !== "SUCCESS") {
    return { ok: false, reason: `Transaction did not succeed (result: ${result.result ?? "unknown"}).` };
  }

  const target = result.to?.toLowerCase();
  const allowed = allowedTargets.map(address => address.toLowerCase());
  if (!target || !allowed.includes(target)) {
    return { ok: false, reason: "Transaction was not sent to the SaucerSwap router or the treasury guard." };
  }
  if (!result.from) return { ok: false, reason: "Mirror node result has no sender." };

  return {
    ok: true,
    payer: result.from.toLowerCase(),
    target,
    amountInTinybars: String(result.amount ?? "0"),
  };
}
