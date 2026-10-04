import { NextResponse } from "next/server";
import { AccountId, Client, PrivateKey, TopicMessageSubmitTransaction } from "@hiero-ledger/sdk";
import { toFunctionSelector } from "viem";
import { createRateLimiter } from "~~/utils/rateLimit";
import {
  GUARD_SWAP_SIGNATURES,
  type GuardReceiptRule,
  type MirrorContractResult,
  SAUCERSWAP_TESTNET,
  TX_HASH_RE,
  verifySwapReceipt,
} from "~~/utils/saucerswap";

export const runtime = "nodejs";

type ReceiptBody = {
  swapTxHash?: string;
};

// Per-instance protection: 10 receipt writes per minute per client, and each tx is written once.
const limiter = createRateLimiter({ max: 10, windowMs: 60_000 });
const written = new Set<string>();
const MAX_REMEMBERED = 2000;

function clientKey(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/** Contracts a receipt may be written for: the SaucerSwap router and, if deployed, the treasury guard. */
function allowedTargets(): string[] {
  const guard = process.env.NEXT_PUBLIC_TREASURY_GUARD_ADDRESS;
  return guard ? [SAUCERSWAP_TESTNET.swapRouter, guard] : [SAUCERSWAP_TESTNET.swapRouter];
}

function guardRule(): GuardReceiptRule | undefined {
  const guard = process.env.NEXT_PUBLIC_TREASURY_GUARD_ADDRESS;
  return guard ? { address: guard, selectors: GUARD_SWAP_SIGNATURES.map(sig => toFunctionSelector(sig)) } : undefined;
}

/**
 * Optional HCS writer. Requires HCS_OPERATOR_ID, HCS_OPERATOR_KEY, HCS_TOPIC_ID.
 * Without them, returns 501 so the UI swap path still works offline.
 *
 * The operator pays for every message, so the endpoint never trusts the request body: it looks the
 * transaction up on the mirror node and writes the verified sender, target and amount.
 */
export async function POST(request: Request) {
  const operatorId = process.env.HCS_OPERATOR_ID;
  const operatorKey = process.env.HCS_OPERATOR_KEY;
  const topicId = process.env.HCS_TOPIC_ID;

  if (!operatorId || !operatorKey || !topicId) {
    return NextResponse.json(
      {
        ok: false,
        enabled: false,
        message: "HCS receipts are disabled. Set HCS_OPERATOR_ID, HCS_OPERATOR_KEY, and HCS_TOPIC_ID.",
      },
      { status: 501 },
    );
  }

  if (!limiter.allow(clientKey(request))) {
    return NextResponse.json(
      { ok: false, message: "Too many receipt requests. Try again in a minute." },
      { status: 429 },
    );
  }

  let body: ReceiptBody;
  try {
    body = (await request.json()) as ReceiptBody;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const swapTxHash = body.swapTxHash?.toLowerCase();
  if (!swapTxHash || !TX_HASH_RE.test(swapTxHash)) {
    return NextResponse.json(
      { ok: false, message: "swapTxHash must be a 32-byte 0x transaction hash." },
      { status: 400 },
    );
  }

  if (written.has(swapTxHash)) {
    return NextResponse.json({ ok: true, enabled: true, duplicate: true, topicId });
  }

  let mirrorResult: MirrorContractResult | null = null;
  try {
    const res = await fetch(`${SAUCERSWAP_TESTNET.mirrorNodeBase}/api/v1/contracts/results/${swapTxHash}`, {
      cache: "no-store",
    });
    if (res.status === 404) {
      return NextResponse.json(
        { ok: false, message: "Transaction is not on the mirror node yet. Retry in a few seconds." },
        { status: 409 },
      );
    }
    if (!res.ok) {
      return NextResponse.json({ ok: false, message: "Mirror node request failed." }, { status: 502 });
    }
    mirrorResult = (await res.json()) as MirrorContractResult;
  } catch {
    return NextResponse.json({ ok: false, message: "Mirror node is unreachable." }, { status: 502 });
  }

  const verdict = verifySwapReceipt(mirrorResult, allowedTargets(), guardRule());
  if (!verdict.ok) {
    return NextResponse.json({ ok: false, message: verdict.reason }, { status: 422 });
  }

  const payload = {
    type: "saucerswap.policy-swap.v2",
    swapTxHash,
    payer: verdict.payer,
    target: verdict.target,
    amountInTinybars: verdict.amountInTinybars,
    tokenOut: SAUCERSWAP_TESTNET.tokenIds.sauce,
    network: "testnet",
    timestamp: new Date().toISOString(),
  };

  try {
    const client = Client.forTestnet().setOperator(
      AccountId.fromString(operatorId),
      PrivateKey.fromStringECDSA(operatorKey.replace(/^0x/, "")),
    );

    const tx = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(JSON.stringify(payload))
      .execute(client);

    const receipt = await tx.getReceipt(client);
    client.close();

    if (written.size >= MAX_REMEMBERED) written.clear();
    written.add(swapTxHash);

    return NextResponse.json({
      ok: true,
      enabled: true,
      topicId,
      status: receipt.status.toString(),
      transactionId: tx.transactionId?.toString() ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        enabled: true,
        message: error instanceof Error ? error.message : "HCS submit failed.",
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  const topicId = process.env.HCS_TOPIC_ID;
  if (!topicId) {
    return NextResponse.json({ enabled: false, messages: [] });
  }

  try {
    const res = await fetch(
      `${SAUCERSWAP_TESTNET.mirrorNodeBase}/api/v1/topics/${topicId}/messages?order=desc&limit=10`,
      { next: { revalidate: 15 } },
    );
    if (!res.ok) {
      return NextResponse.json({ enabled: true, topicId, messages: [] });
    }
    const data = (await res.json()) as {
      messages?: Array<{ consensus_timestamp: string; message: string }>;
    };
    const messages = (data.messages ?? []).map(item => {
      let decoded: unknown = null;
      try {
        decoded = JSON.parse(Buffer.from(item.message, "base64").toString("utf8"));
      } catch {
        decoded = item.message;
      }
      return { consensusTimestamp: item.consensus_timestamp, body: decoded };
    });
    return NextResponse.json({ enabled: true, topicId, messages });
  } catch {
    return NextResponse.json({ enabled: true, topicId, messages: [] });
  }
}
