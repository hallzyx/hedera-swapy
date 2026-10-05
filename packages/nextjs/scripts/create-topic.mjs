/**
 * Creates the HCS topic used by the audit trail (POST /api/receipts) on Hedera testnet.
 * Costs a small fee, paid by the operator account. Only the operator key can submit to the topic.
 *
 * Usage: HCS_OPERATOR_ID=0.0.x HCS_OPERATOR_KEY=<ECDSA hex> yarn hcs:create-topic
 * Then set HCS_TOPIC_ID=<printed id> next to the other two in packages/nextjs/.env.local.
 * The key is read from the environment and never printed.
 */
import { AccountId, Client, PrivateKey, TopicCreateTransaction } from "@hiero-ledger/sdk";

const operatorId = process.env.HCS_OPERATOR_ID;
const operatorKey = process.env.HCS_OPERATOR_KEY;
if (!operatorId || !operatorKey) {
  console.error("Set HCS_OPERATOR_ID and HCS_OPERATOR_KEY in your shell, then run yarn hcs:create-topic again.");
  process.exit(1);
}

try {
  const key = PrivateKey.fromStringECDSA(operatorKey.replace(/^0x/, ""));
  const client = Client.forTestnet().setOperator(AccountId.fromString(operatorId), key);

  const response = await new TopicCreateTransaction()
    .setTopicMemo("Treasury swap guard audit trail")
    .setSubmitKey(key.publicKey)
    .execute(client);
  const { topicId } = await response.getReceipt(client);

  console.log(`HCS_TOPIC_ID=${topicId}`);
  console.log(`HashScan: https://hashscan.io/testnet/topic/${topicId}`);
  client.close();
} catch (error) {
  console.error(`Could not create the topic: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
