import { swapRouterAbi } from "./abi";
import { SAUCERSWAP_TESTNET } from "./addresses";
import { tinybarsToEvmWei } from "./amounts";
import { applySlippage } from "./policy";
import { type Address, type Hex, encodeFunctionData } from "viem";

export type BuildSwapCallParams = {
  recipient: Address;
  path: Hex;
  amountInTinybars: bigint;
  quotedAmountOut: bigint;
  slippageBps: number;
  /** Unix seconds; defaults to now + 20 minutes. */
  deadline?: bigint;
};

export type BuiltSwapCall = {
  to: Address;
  data: Hex;
  value: bigint;
  amountOutMinimum: bigint;
  deadline: bigint;
};

/** Encode SwapRouter.multicall([exactInput, refundETH]) with payable HBAR value. */
export function buildExactInputSwapCall(params: BuildSwapCallParams): BuiltSwapCall {
  const deadline = params.deadline ?? BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
  const amountOutMinimum = applySlippage(params.quotedAmountOut, params.slippageBps);

  const exactInputData = encodeFunctionData({
    abi: swapRouterAbi,
    functionName: "exactInput",
    args: [
      {
        path: params.path,
        recipient: params.recipient,
        deadline,
        amountIn: params.amountInTinybars,
        amountOutMinimum,
      },
    ],
  });

  const refundData = encodeFunctionData({
    abi: swapRouterAbi,
    functionName: "refundETH",
  });

  const data = encodeFunctionData({
    abi: swapRouterAbi,
    functionName: "multicall",
    args: [[exactInputData, refundData]],
  });

  return {
    to: SAUCERSWAP_TESTNET.swapRouter,
    data,
    value: tinybarsToEvmWei(params.amountInTinybars),
    amountOutMinimum,
    deadline,
  };
}

export function hashscanTxUrl(txHash: string): string {
  return `${SAUCERSWAP_TESTNET.hashscanBase}/transaction/${txHash}`;
}
