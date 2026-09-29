import { NextResponse } from "next/server";
import { AccountId, Client, PrivateKey, TopicMessageSubmitTransaction } from "@hiero-ledger/sdk";
import { SAUCERSWAP_TESTNET } from "~~/utils/saucerswap";

export const runtime = "nodejs";

type ReceiptBody = {
  type?: string;
  swapTxHash?: string;
  payer?: string;
  amountInTinybars?: string;
  amountOutMinimum?: string;
  tokenOut?: string;
};

/**
 * Optional HCS writer. Requires HCS_OPERATOR_ID, HCS_OPERATOR_KEY, HCS_TOPIC_ID.
 * Without them, returns 501 so the UI swap path still works offline.
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

  let body: ReceiptBody;
  try {
    body = (await request.json()) as ReceiptBody;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.swapTxHash) {
    return NextResponse.json({ ok: false, message: "swapTxHash is required." }, { status: 400 });
  }

  const payload = {
    type: body.type ?? "saucerswap.policy-swap.v1",
    swapTxHash: body.swapTxHash,
    payer: body.payer ?? null,
    amountInTinybars: body.amountInTinybars ?? null,
    amountOutMinimum: body.amountOutMinimum ?? null,
    tokenOut: body.tokenOut ?? SAUCERSWAP_TESTNET.tokenIds.sauce,
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
