import type { Address, Hex } from "viem";
import { concatHex, padHex, toHex } from "viem";

/**
 * Encode a Uniswap-V3-style path: token (20 bytes) | fee (3 bytes) | token (20 bytes) …
 */
export function encodeV2Path(tokenIn: Address, fee: number, tokenOut: Address): Hex {
  return concatHex([
    padHex(tokenIn as Hex, { size: 20 }),
    padHex(toHex(fee), { size: 3 }),
    padHex(tokenOut as Hex, { size: 20 }),
  ]);
}
