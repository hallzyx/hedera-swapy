"use client";

import { useEffect, useState } from "react";
import { formatTinybars } from "~~/utils/saucerswap";

type ReceiptBody = {
  swapTxHash?: string;
  payer?: string;
  amountInTinybars?: string;
};

type AuditMessage = { consensusTimestamp: string; body: ReceiptBody | string | null };
type AuditResponse = { enabled: boolean; topicId?: string; messages: AuditMessage[] };

/** Mirror-node consensus timestamps look like "1790696429.805962774" (seconds.nanos). */
function formatConsensus(timestamp: string): string {
  return new Date(Number(timestamp.split(".")[0]) * 1000).toLocaleString();
}

/** Last HCS receipts written for swaps, read through GET /api/receipts. Hidden until HCS is configured. */
export const AuditTrail = () => {
  const [audit, setAudit] = useState<AuditResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/receipts")
      .then(res => (res.ok ? (res.json() as Promise<AuditResponse>) : Promise.reject(new Error(String(res.status)))))
      .then(data => !cancelled && setAudit(data))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <p className="text-sm text-base-content/60 m-0" data-testid="audit-error">
        The audit trail could not be loaded right now.
      </p>
    );
  }

  if (!audit) return null;

  if (!audit.enabled) {
    return (
      <div className="bg-base-100 rounded-2xl border border-dashed border-base-300 p-6" data-testid="audit-setup">
        <h3 className="font-bold text-lg mb-2 mt-0">Audit trail (HCS)</h3>
        <p className="text-sm text-base-content/70 m-0">
          Set <code>HCS_OPERATOR_ID</code>, <code>HCS_OPERATOR_KEY</code> and <code>HCS_TOPIC_ID</code> on the server to
          publish a receipt for every confirmed swap. Each receipt is checked against the mirror node first.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-base-100 rounded-2xl border border-base-300 p-6" data-testid="audit-trail">
      <h3 className="font-bold text-lg mb-1 mt-0">Audit trail (HCS)</h3>
      <p className="text-sm text-base-content/70 mt-0 mb-3">
        Receipts published to topic {audit.topicId}. Every entry was verified on the mirror node before it was written.
      </p>
      {audit.messages.length === 0 ? (
        <p className="text-sm m-0">No receipts yet.</p>
      ) : (
        <ul className="list-none p-0 m-0 space-y-2">
          {audit.messages.map(message => {
            const body = typeof message.body === "object" && message.body !== null ? message.body : null;
            return (
              <li key={message.consensusTimestamp} className="rounded-xl border border-base-300 p-3 text-sm">
                {body?.swapTxHash ? (
                  <>
                    <span className="font-medium">
                      {body.amountInTinybars ? `${formatTinybars(BigInt(body.amountInTinybars))} HBAR` : "Swap"}
                    </span>
                    <span className="text-base-content/60"> · {formatConsensus(message.consensusTimestamp)}</span>
                    <div>
                      <a
                        className="link link-primary break-all"
                        href={`https://hashscan.io/testnet/transaction/${body.swapTxHash}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {body.swapTxHash.slice(0, 18)}…
                      </a>
                    </div>
                  </>
                ) : (
                  <span className="text-base-content/60">Unrecognised message at {message.consensusTimestamp}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
