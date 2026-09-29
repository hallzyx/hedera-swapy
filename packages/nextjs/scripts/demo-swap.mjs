/**
 * Optional headless demo: associate SAUCE + exactInput HBAR→SAUCE on testnet.
 * Requires SWAP_PRIVATE_KEY (ECDSA hex, no 0x) funded with testnet HBAR.
 *
 * Usage: SWAP_PRIVATE_KEY=... yarn demo:swap
 */
import { createPublicClient, createWalletClient, decodeFunctionResult, encodeFunctionData, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hederaTestnet } from "viem/chains";

const toSol = n => `0x${BigInt(n).toString(16).padStart(40, "0")}`;
const WHBAR = toSol(15058);
const SAUCE = toSol(1183558);
const QUOTER = toSol(1390002);
const ROUTER = toSol(1414040);
const HTS = "0x0000000000000000000000000000000000000167";
const FEE = 3000;
const AMOUNT_TINY = 100_000_000n; // 1 HBAR
const RPC = process.env.NEXT_PUBLIC_HEDERA_TESTNET_RPC_URL || "https://testnet.hashio.io/api";
const MIRROR = "https://testnet.mirrornode.hedera.com";

const quoterAbi = parseAbi([
  "function quoteExactInput(bytes path, uint256 amountIn) returns (uint256 amountOut, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate)",
]);
const routerAbi = parseAbi([
  "function exactInput((bytes path, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum) params) payable returns (uint256 amountOut)",
  "function refundETH() payable",
  "function multicall(bytes[] data) payable returns (bytes[] results)",
]);
const htsAbi = parseAbi(["function associateToken(address account, address token) returns (int64 responseCode)"]);

function encodePath() {
  const feeHex = FEE.toString(16).padStart(6, "0");
  return `0x${WHBAR.slice(2)}${feeHex}${SAUCE.slice(2)}`;
}

async function isAssociated(account) {
  const res = await fetch(`${MIRROR}/api/v1/accounts/${account}/tokens?token.id=0.0.1183558&limit=1`);
  if (!res.ok) return false;
  const body = await res.json();
  return Array.isArray(body.tokens) && body.tokens.length > 0;
}

async function main() {
  const pk = process.env.SWAP_PRIVATE_KEY;
  if (!pk) {
    console.error("Set SWAP_PRIVATE_KEY (funded Hedera testnet ECDSA key, with or without 0x).");
    process.exit(1);
  }
  const normalized = pk.startsWith("0x") ? pk : `0x${pk}`;
  const account = privateKeyToAccount(normalized);
  const publicClient = createPublicClient({ chain: hederaTestnet, transport: http(RPC, { batch: false }) });
  const walletClient = createWalletClient({
    account,
    chain: hederaTestnet,
    transport: http(RPC, { batch: false }),
  });

  console.log("Account", account.address);

  if (!(await isAssociated(account.address))) {
    console.log("Associating SAUCE…");
    const assocHash = await walletClient.writeContract({
      address: HTS,
      abi: htsAbi,
      functionName: "associateToken",
      args: [account.address, SAUCE],
      gas: 1_000_000n,
    });
    console.log("Associate tx", assocHash);
    await publicClient.waitForTransactionReceipt({ hash: assocHash });
  } else {
    console.log("SAUCE already associated.");
  }

  const path = encodePath();
  const quoteData = encodeFunctionData({
    abi: quoterAbi,
    functionName: "quoteExactInput",
    args: [path, AMOUNT_TINY],
  });
  const quoteRaw = await publicClient.call({ to: QUOTER, data: quoteData });
  const quoted = decodeFunctionResult({
    abi: quoterAbi,
    functionName: "quoteExactInput",
    data: quoteRaw.data,
  });
  const amountOut = quoted[0];
  const amountOutMinimum = (amountOut * 9900n) / 10000n;
  console.log("Quoted amountOut", amountOut.toString(), "min", amountOutMinimum.toString());

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
  const exactInput = encodeFunctionData({
    abi: routerAbi,
    functionName: "exactInput",
    args: [
      {
        path,
        recipient: account.address,
        deadline,
        amountIn: AMOUNT_TINY,
        amountOutMinimum,
      },
    ],
  });
  const refund = encodeFunctionData({ abi: routerAbi, functionName: "refundETH" });
  const data = encodeFunctionData({
    abi: routerAbi,
    functionName: "multicall",
    args: [[exactInput, refund]],
  });

  const value = AMOUNT_TINY * 10n ** 10n; // tinybars → 18-decimal wei
  console.log("Sending swap…");
  const hash = await walletClient.sendTransaction({
    to: ROUTER,
    data,
    value,
    gas: 2_000_000n,
  });
  console.log("Swap tx", hash);
  await publicClient.waitForTransactionReceipt({ hash });
  console.log("HashScan", `https://hashscan.io/testnet/transaction/${hash}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
