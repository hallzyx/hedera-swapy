import { htsAssociateAbi } from "./abi";
import { SAUCERSWAP_TESTNET } from "./addresses";
import { type Address, type Hex, encodeFunctionData } from "viem";

export type AssociationStatus = {
  associated: boolean;
  checked: boolean;
};

/**
 * Mirror-node check: whether `account` already holds / is associated with SAUCE.
 * EVM address or Hedera account id both work on the accounts endpoint.
 */
export async function isSauceAssociated(
  account: Address,
  mirrorBase: string = SAUCERSWAP_TESTNET.mirrorNodeBase,
): Promise<AssociationStatus> {
  const url = `${mirrorBase}/api/v1/accounts/${account}/tokens?token.id=${SAUCERSWAP_TESTNET.tokenIds.sauce}&limit=1`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return { associated: false, checked: false };
    }
    const body = (await res.json()) as { tokens?: unknown[] };
    return { associated: Array.isArray(body.tokens) && body.tokens.length > 0, checked: true };
  } catch {
    return { associated: false, checked: false };
  }
}

export function buildAssociateSauceCall(account: Address): { to: Address; data: Hex } {
  return {
    to: SAUCERSWAP_TESTNET.htsPrecompile,
    data: encodeFunctionData({
      abi: htsAssociateAbi,
      functionName: "associateToken",
      args: [account, SAUCERSWAP_TESTNET.sauce],
    }),
  };
}
