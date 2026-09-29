import { quoterV2Abi } from "./abi";
import { SAUCERSWAP_TESTNET } from "./addresses";
import { encodeV2Path } from "./path";
import { type Hex, createPublicClient, decodeFunctionResult, encodeFunctionData, http } from "viem";
import { hederaTestnet } from "viem/chains";

export type QuoteExactInputResult = {
  amountOut: bigint;
  path: Hex;
  gasEstimate: bigint;
};

export async function quoteExactInputHbarToSauce(
  amountInTinybars: bigint,
  rpcUrl: string = SAUCERSWAP_TESTNET.rpcUrl,
): Promise<QuoteExactInputResult> {
  if (amountInTinybars <= 0n) {
    throw new Error("Quote amount must be greater than zero.");
  }

  const path = encodeV2Path(SAUCERSWAP_TESTNET.whbar, SAUCERSWAP_TESTNET.poolFee, SAUCERSWAP_TESTNET.sauce);

  const data = encodeFunctionData({
    abi: quoterV2Abi,
    functionName: "quoteExactInput",
    args: [path, amountInTinybars],
  });

  const client = createPublicClient({
    chain: hederaTestnet,
    transport: http(rpcUrl, { batch: false }),
  });

  const result = await client.call({
    to: SAUCERSWAP_TESTNET.quoterV2,
    data,
  });

  if (!result.data || result.data === "0x") {
    throw new Error("QuoterV2 returned empty data. The WHBAR/SAUCE pool may lack liquidity.");
  }

  const decoded = decodeFunctionResult({
    abi: quoterV2Abi,
    functionName: "quoteExactInput",
    data: result.data,
  });

  return {
    amountOut: decoded[0],
    path,
    gasEstimate: decoded[3],
  };
}
