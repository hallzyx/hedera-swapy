/** Subset of the mirror node `GET /api/v1/contracts/results/{hash}` response used for verification. */
export type MirrorContractResult = {
  result?: string;
  from?: string;
  to?: string;
  amount?: number | string | null;
  /** Call data of the transaction, `0x` + 4-byte selector + arguments. */
  function_parameters?: string | null;
};

/** Receipts for the treasury guard are only written for the listed function selectors. */
export type GuardReceiptRule = { address: string; selectors: readonly string[] };

export type ReceiptVerification =
  | { ok: true; payer: string; target: string; amountInTinybars: string | null }
  | { ok: false; reason: string };

export const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

/**
 * Decide whether a mirror-node contract result is a successful call to one of the contracts this
 * template writes receipts for (the SaucerSwap router, or the optional TreasuryPolicyGuard).
 *
 * Receipt fields must come from this verified result, never from the request body.
 *
 * Calls to the guard only count when they run a swap (`guardRule.selectors`), so a pause or an approval
 * cannot be turned into a receipt. Their HBAR leaves the guard internally, so the tx value says nothing
 * about the amount and `amountInTinybars` is null.
 */
export function verifySwapReceipt(
  result: MirrorContractResult | null | undefined,
  allowedTargets: readonly string[],
  guardRule?: GuardReceiptRule,
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

  if (guardRule && target === guardRule.address.toLowerCase()) {
    const selector = result.function_parameters?.slice(0, 10).toLowerCase();
    const isSwap =
      selector !== undefined && guardRule.selectors.some(candidate => candidate.toLowerCase() === selector);
    if (!isSwap) return { ok: false, reason: "Only swap calls to the treasury guard get a receipt." };
    return { ok: true, payer: result.from.toLowerCase(), target, amountInTinybars: null };
  }

  return {
    ok: true,
    payer: result.from.toLowerCase(),
    target,
    amountInTinybars: String(result.amount ?? "0"),
  };
}
