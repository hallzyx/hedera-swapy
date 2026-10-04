/**
 * `yarn doctor`: checks that this checkout can run the treasury swap guard on Hedera testnet and says
 * what to fix when it cannot. It only reads: no transactions, and secrets are never printed.
 *
 * Checks: Node version, treasury.config.json, env files, RPC + mirror node, the deployed guard (code,
 * limits, approval policy, price floors, balance, pause) and the accounts you pass in:
 *   TREASURY_GUARD_ADDRESS (or NEXT_PUBLIC_TREASURY_GUARD_ADDRESS in packages/nextjs/.env.local)
 *   SWAP_PRIVATE_KEY / TREASURY_EXECUTOR      executor and, in the starter setup, payout account
 *   APPROVER_PRIVATE_KEY / TREASURY_APPROVER  optional second signer
 *   GUARDIAN_PRIVATE_KEY / TREASURY_GUARDIAN  optional, defaults to the executor
 *   ADMIN_PRIVATE_KEY / TREASURY_ADMIN        optional, defaults to the executor
 *   TREASURY_PAYOUT_ADDRESS                   optional, defaults to the executor
 *
 * Exit code 1 when anything fails; warnings do not fail the run.
 */
import { existsSync, readFileSync } from "node:fs";
import { createPublicClient, formatUnits, http, keccak256, parseAbi, parseUnits, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hederaTestnet } from "viem/chains";

const MIN_NODE = [20, 18, 3];
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const ZERO_ROLE = `0x${"00".repeat(32)}`;
const MIRROR = "https://testnet.mirrornode.hedera.com";
const RPC_DEFAULT = "https://testnet.hashio.io/api";

const guardAbi = parseAbi([
  "function limits() view returns (uint256 minAmountIn, uint256 maxAmountIn, uint256 dailyCap)",
  "function approvalPolicy() view returns (uint256 threshold, uint8 required)",
  "function tokenRules(address token) view returns (bool allowed, uint256 minOutPerHbar)",
  "function allowedRecipients(address recipient) view returns (bool)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function paused() view returns (bool)",
]);

const results = [];
const record = (status, name, detail = "", fix = "") => results.push({ status, name, detail, fix });
const pass = (name, detail) => record("pass", name, detail);
const warn = (name, detail, fix) => record("warn", name, detail, fix);
const fail = (name, detail, fix) => record("fail", name, detail, fix);
const info = (name, detail) => record("info", name, detail);

/** Runs one check; an unexpected error becomes a failed result instead of stopping the run. */
async function check(name, fn) {
  try {
    await fn();
  } catch (error) {
    fail(name, error instanceof Error ? error.message.split("\n")[0] : String(error));
  }
}

function loadEnvFiles() {
  for (const file of ["packages/nextjs/.env.local", "packages/nextjs/.env"]) {
    const path = new URL(`../../../${file}`, import.meta.url);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (!match || line.trim().startsWith("#")) continue;
      const value = match[2].replace(/^["']|["']$/g, "");
      if (value && process.env[match[1]] === undefined) process.env[match[1]] = value;
    }
  }
}

const toKey = value => (value.startsWith("0x") ? value : `0x${value}`);

/** Address from an explicit address variable, else derived from a private-key variable. */
function accountFrom(addressVar, keyVar) {
  const address = process.env[addressVar];
  if (address) return ADDRESS_RE.test(address) ? address : null;
  const key = process.env[keyVar];
  return key ? privateKeyToAccount(toKey(key)).address : undefined;
}

function checkNodeAndConfig() {
  const current = process.versions.node.split(".").map(Number);
  const ok = current[0] > MIN_NODE[0] || (current[0] === MIN_NODE[0] && (current[1] > MIN_NODE[1] || (current[1] === MIN_NODE[1] && current[2] >= MIN_NODE[2])));
  if (ok) pass("Node.js", `v${process.versions.node}`);
  else fail("Node.js", `v${process.versions.node}, need ${MIN_NODE.join(".")} or newer`, "Install a newer Node (nvm install 20).");

  const config = JSON.parse(readFileSync(new URL("../../../treasury.config.json", import.meta.url), "utf8"));
  const { limits, approval, tokens } = config;
  const problems = [];
  const min = Number(limits.minHbarPerSwap);
  const max = Number(limits.maxHbarPerSwap);
  if (!(max > 0)) problems.push("maxHbarPerSwap must be above zero");
  if (min > max) problems.push("minHbarPerSwap is above maxHbarPerSwap");
  if (max > Number(limits.dailyCapHbar)) problems.push("maxHbarPerSwap is above dailyCapHbar");
  if (!Number.isInteger(approval.requiredApprovals) || approval.requiredApprovals < 1) problems.push("requiredApprovals must be 1 or more");
  if (!Array.isArray(tokens) || tokens.length === 0) problems.push("no output tokens");
  for (const token of tokens ?? []) {
    if (!/^0\.0\.\d+$/.test(token.tokenId)) problems.push(`${token.symbol}: bad tokenId`);
  }
  if (problems.length === 0) pass("treasury.config.json", `${limits.minHbarPerSwap}-${limits.maxHbarPerSwap} HBAR per swap, ${limits.dailyCapHbar}/day, ${tokens.length} token(s)`);
  else fail("treasury.config.json", problems.join("; "), "Fix the values in treasury.config.json at the repository root.");
  return config;
}

function checkEnv(guard) {
  if (!guard) {
    warn("Guard address", "not set", "Deploy the guard, then set NEXT_PUBLIC_TREASURY_GUARD_ADDRESS in packages/nextjs/.env.local. UI mode works without it.");
  } else if (!ADDRESS_RE.test(guard)) {
    fail("Guard address", "is not a 20-byte hex address", "Use the 0x... address printed by the deploy script.");
  } else {
    pass("Guard address", guard);
  }

  const hcs = ["HCS_OPERATOR_ID", "HCS_OPERATOR_KEY", "HCS_TOPIC_ID"].filter(name => process.env[name]);
  if (hcs.length === 0) info("HCS receipts", "disabled (optional)");
  else if (hcs.length === 3) pass("HCS receipts", "operator and topic configured");
  else warn("HCS receipts", `only ${hcs.join(", ")} set`, "Set all three of HCS_OPERATOR_ID, HCS_OPERATOR_KEY and HCS_TOPIC_ID, or none.");

  if (!process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID) {
    warn("WalletConnect project id", "not set", "Set NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID if the wallet modal fails to load.");
  }
}

async function checkNetwork(client) {
  await check("Hedera testnet RPC", async () => {
    const chainId = await client.getChainId();
    if (chainId === 296) pass("Hedera testnet RPC", `chain id ${chainId}`);
    else fail("Hedera testnet RPC", `chain id ${chainId}, expected 296`, "Point NEXT_PUBLIC_HEDERA_TESTNET_RPC_URL at a testnet relay.");
  });
  await check("Mirror node", async () => {
    const res = await fetch(`${MIRROR}/api/v1/blocks?limit=1`);
    if (res.ok) pass("Mirror node", "reachable");
    else warn("Mirror node", `HTTP ${res.status}`, "Association checks and receipts need it. Retry later.");
  });
}

async function isAssociated(account, tokenId) {
  const res = await fetch(`${MIRROR}/api/v1/accounts/${account}/tokens?token.id=${tokenId}&limit=1`);
  if (!res.ok) return undefined;
  const body = await res.json();
  return Array.isArray(body.tokens) && body.tokens.length > 0;
}

async function checkGuard(client, guard, config) {
  const read = (functionName, args = []) => client.readContract({ address: guard, abi: guardAbi, functionName, args });

  const code = await client.getCode({ address: guard });
  if (!code || code === "0x") {
    fail("Guard contract", "no contract code at that address", "Check the address and that you deployed to testnet (chain 296).");
    return false;
  }
  pass("Guard contract", "deployed");

  await check("Guard policy", async () => {
    const [[minIn, maxIn, dailyCap], [threshold, required]] = await Promise.all([read("limits"), read("approvalPolicy")]);
    const hbar = value => parseUnits(value, 8);
    const expected = config.limits;
    const same = minIn === hbar(expected.minHbarPerSwap) && maxIn === hbar(expected.maxHbarPerSwap) && dailyCap === hbar(expected.dailyCapHbar);
    const detail = `${formatUnits(minIn, 8)}-${formatUnits(maxIn, 8)} HBAR per swap, ${formatUnits(dailyCap, 8)}/day`;
    if (same) pass("Guard limits", `${detail} (match the config)`);
    else warn("Guard limits", `${detail} (differ from treasury.config.json)`, "Fine if the admin changed them on purpose; otherwise call setLimits or edit the config.");

    const approvalOff = threshold >= maxIn;
    if (approvalOff) info("Approval lane", "off: every swap uses the direct lane");
    else if (threshold === hbar(config.approval.thresholdHbar) && required === config.approval.requiredApprovals) {
      pass("Approval lane", `swaps above ${formatUnits(threshold, 8)} HBAR need ${required} approval(s)`);
    } else {
      warn("Approval lane", `threshold ${formatUnits(threshold, 8)} HBAR, ${required} approval(s) (differs from the config)`, "Call setApprovalPolicy or edit the config.");
    }
  });

  await check("Output tokens", async () => {
    for (const token of config.tokens) {
      const address = `0x${BigInt(token.tokenId.split(".")[2]).toString(16).padStart(40, "0")}`;
      const [allowed, floor] = await read("tokenRules", [address]);
      if (!allowed) fail(`Token ${token.symbol}`, "not allowed on the guard", `Admin: setTokenRule(${address}, true, ${token.minOutPerHbar}).`);
      else if (floor.toString() !== token.minOutPerHbar) warn(`Token ${token.symbol}`, `price floor ${floor} (config says ${token.minOutPerHbar})`, "Fine if intentional.");
      else pass(`Token ${token.symbol}`, `allowed, floor ${floor} per HBAR`);
    }
  });

  await check("Guard status", async () => {
    const [paused, balance] = await Promise.all([read("paused"), client.getBalance({ address: guard })]);
    if (paused) fail("Guard status", "paused", "Admin: unpause().");
    else pass("Guard status", "active");
    // JSON-RPC reports 18-decimal weibars; the contract itself works in tinybars.
    const tinybars = balance / 10n ** 10n;
    const maxSwap = parseUnits(config.limits.maxHbarPerSwap, 8);
    if (tinybars === 0n) fail("Guard balance", "0 HBAR", "Send testnet HBAR to the guard address.");
    else if (tinybars < maxSwap) warn("Guard balance", `${formatUnits(tinybars, 8)} HBAR, below the per-swap maximum`, "Top up the guard if you want to test large swaps.");
    else pass("Guard balance", `${formatUnits(tinybars, 8)} HBAR`);
  });
  return true;
}

async function checkAccounts(client, guard, config) {
  const executor = accountFrom("TREASURY_EXECUTOR", "SWAP_PRIVATE_KEY");
  const roles = [
    ["Executor", "EXECUTOR_ROLE", executor, true],
    ["Approver", "APPROVER_ROLE", accountFrom("TREASURY_APPROVER", "APPROVER_PRIVATE_KEY"), false],
    ["Guardian", "GUARDIAN_ROLE", accountFrom("TREASURY_GUARDIAN", "GUARDIAN_PRIVATE_KEY") ?? executor, false],
    ["Admin", "DEFAULT_ADMIN_ROLE", accountFrom("TREASURY_ADMIN", "ADMIN_PRIVATE_KEY") ?? executor, false],
  ];

  if (!executor) {
    info("Accounts", "set SWAP_PRIVATE_KEY (or TREASURY_EXECUTOR) to check roles, payout and association");
    return;
  }

  for (const [label, role, address, required] of roles) {
    if (address === null) {
      fail(`${label} account`, "address variable is not a valid 0x address");
      continue;
    }
    if (!address) {
      info(`${label} role`, "no account given, skipped");
      continue;
    }
    if (!guard) continue;
    await check(`${label} role`, async () => {
      const hash = role === "DEFAULT_ADMIN_ROLE" ? ZERO_ROLE : keccak256(stringToHex(role));
      const has = await client.readContract({ address: guard, abi: guardAbi, functionName: "hasRole", args: [hash, address] });
      if (has) pass(`${label} role`, address);
      else if (required) fail(`${label} role`, `${address} lacks ${role}`, `Admin: grantRole(${role}, ${address}).`);
      else warn(`${label} role`, `${address} lacks ${role}`, `Admin: grantRole(${role}, ${address}).`);
    });
  }

  const approver = roles[1][2];
  if (approver && approver.toLowerCase() === executor.toLowerCase()) {
    warn("Two-person rule", "executor and approver are the same account", "Use a different account as approver; the contract rejects self-approval.");
  }

  const payout = process.env.TREASURY_PAYOUT_ADDRESS ?? executor;
  if (!ADDRESS_RE.test(payout)) {
    fail("Payout account", "TREASURY_PAYOUT_ADDRESS is not a valid 0x address");
    return;
  }
  if (guard) {
    await check("Payout allowlist", async () => {
      const allowed = await client.readContract({ address: guard, abi: guardAbi, functionName: "allowedRecipients", args: [payout] });
      if (allowed) pass("Payout allowlist", payout);
      else fail("Payout allowlist", `${payout} is not allowed`, `Admin: setRecipient(${payout}, true).`);
    });
  }
  for (const token of config.tokens) {
    await check(`${token.symbol} association`, async () => {
      const associated = await isAssociated(payout, token.tokenId);
      if (associated === undefined) warn(`${token.symbol} association`, "unknown (mirror node unreachable)", "Retry; unknown is not the same as not associated.");
      else if (associated) pass(`${token.symbol} association`, "payout account is associated");
      else fail(`${token.symbol} association`, "payout account is not associated", "Associate it in the app (Swap card) or with the HTS precompile before swapping.");
    });
  }

  await check("Gas balance", async () => {
    const balance = await client.getBalance({ address: executor });
    const hbar = Number(formatUnits(balance, 18));
    if (hbar < 1) warn("Gas balance", `${hbar} HBAR on the executor`, "Fund the executor from the Hedera testnet faucet.");
    else pass("Gas balance", `${hbar.toFixed(2)} HBAR on the executor`);
  });
}

const SYMBOL = { pass: "OK  ", warn: "WARN", fail: "FAIL", info: "INFO" };

async function main() {
  loadEnvFiles();
  const config = checkNodeAndConfig();
  const guard = process.env.TREASURY_GUARD_ADDRESS || process.env.NEXT_PUBLIC_TREASURY_GUARD_ADDRESS;
  checkEnv(guard);

  const client = createPublicClient({
    chain: hederaTestnet,
    transport: http(process.env.NEXT_PUBLIC_HEDERA_TESTNET_RPC_URL || RPC_DEFAULT, { batch: false }),
  });
  await checkNetwork(client);

  const guardOk = guard && ADDRESS_RE.test(guard) ? await checkGuard(client, guard, config).catch(error => {
    fail("Guard contract", error instanceof Error ? error.message.split("\n")[0] : String(error));
    return false;
  }) : false;
  await checkAccounts(client, guardOk ? guard : undefined, config);

  for (const { status, name, detail, fix } of results) {
    console.log(`${SYMBOL[status]} ${name}${detail ? `: ${detail}` : ""}`);
    if (fix && status !== "pass") console.log(`     -> ${fix}`);
  }
  const count = status => results.filter(result => result.status === status).length;
  console.log(`\n${count("pass")} passed, ${count("warn")} warning(s), ${count("fail")} failed.`);
  process.exit(count("fail") > 0 ? 1 : 0);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
