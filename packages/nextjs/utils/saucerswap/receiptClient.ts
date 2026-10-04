/** Asks the server to publish an HCS receipt. The server verifies the transaction on the mirror node itself. */
export function requestReceipt(swapTxHash: string): void {
  void fetch("/api/receipts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ swapTxHash }),
  }).catch(() => undefined);
}
