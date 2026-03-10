import { hash } from "starknet";
import type { EarnProtocolAdapter } from "./protocols.js";
import type { EarnHistoryEntry, EarnHistoryType, EarnPool, EarnPosition, EarnToken } from "../../types/earn.js";
import { settings } from "../settings.js";

const PROTOCOL = "endur";

const XSTRK_MAINNET = "0x028d709c875c0ceac3dce7065bec5328186dc89fe254527084d1689910954b0a";
const XSTRK_SEPOLIA = "0x042de5b868da876768213c48019b8d46cd484e66013ae3275f8a4b97b31fc7eb";

const STRK_ADDRESS = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

const BLOCKS_PER_PAGE = 1000;
const PAGES_TO_SCAN = 10;
const CHUNK_SIZE = 200;

// ERC-4626 function selectors
const TOTAL_ASSETS_SELECTOR = hash.getSelectorFromName("total_assets");
const TOTAL_SUPPLY_SELECTOR = hash.getSelectorFromName("total_supply");
const BALANCE_OF_SELECTOR = hash.getSelectorFromName("balance_of");
const CONVERT_TO_ASSETS_SELECTOR = hash.getSelectorFromName("convert_to_assets");

// Event selectors: ERC-4626 Deposit and Withdraw
const DEPOSIT_SELECTOR = hash.getSelectorFromName("Deposit");
const WITHDRAW_SELECTOR = hash.getSelectorFromName("Withdraw");

const EVENT_TYPE_BY_SELECTOR = new Map<string, EarnHistoryType>([
  [normalizeHex(DEPOSIT_SELECTOR), "stake"],
  [normalizeHex(WITHDRAW_SELECTOR), "exit"],
]);

function normalizeHex(value: string): string {
  const sanitized = value.toLowerCase();
  return sanitized.startsWith("0x") ? sanitized : `0x${sanitized}`;
}

function getXstrkAddress(): string {
  return settings.network === "mainnet" ? XSTRK_MAINNET : XSTRK_SEPOLIA;
}

function getStrkToken(): EarnToken {
  return { symbol: "STRK", address: STRK_ADDRESS, decimals: 18 };
}

// Parse a u256 from two felts (low, high)
function parseU256(low: string, high: string): bigint {
  return BigInt(low) + (BigInt(high) << 128n);
}

function formatUnits(value: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = value / divisor;
  const remainder = value % divisor;
  if (remainder === 0n) return whole.toString();
  const fractional = remainder.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}.${fractional}`;
}

type RpcCallResult = string[];

async function rpcCall<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(settings.rpc_url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params,
    }),
  });

  const payload = (await res.json().catch(() => ({}))) as {
    result?: T;
    error?: { message?: string };
  };

  if (!res.ok || payload.error) {
    const message = payload.error?.message || `RPC call failed (${res.status})`;
    throw new Error(message);
  }

  return payload.result as T;
}

async function starknetCall(contractAddress: string, selector: string, calldata: string[] = []): Promise<string[]> {
  return rpcCall<RpcCallResult>("starknet_call", [
    {
      contract_address: contractAddress,
      entry_point_selector: selector,
      calldata,
    },
    "latest",
  ]);
}

async function getLatestBlockNumber(): Promise<number> {
  const latest = await rpcCall<number>("starknet_blockNumber", []);
  return Number(latest);
}

async function getBlockTimestamp(blockNumber: number): Promise<number | null> {
  const result = await rpcCall<{ timestamp?: number }>(
    "starknet_getBlockWithTxHashes",
    [{ block_number: blockNumber }]
  );
  return typeof result.timestamp === "number" ? result.timestamp : null;
}

async function getPools(): Promise<EarnPool[]> {
  const xstrkAddress = getXstrkAddress();

  const [totalAssetsResult, totalSupplyResult] = await Promise.all([
    starknetCall(xstrkAddress, TOTAL_ASSETS_SELECTOR),
    starknetCall(xstrkAddress, TOTAL_SUPPLY_SELECTOR),
  ]);

  const totalAssets = parseU256(totalAssetsResult[0], totalAssetsResult[1]);
  const delegatedAmount = formatUnits(totalAssets, 18);

  return [
    {
      id: xstrkAddress,
      poolContract: xstrkAddress,
      validator: {
        name: "Endur",
        stakerAddress: xstrkAddress,
      },
      token: getStrkToken(),
      delegatedAmount,
      commissionPercent: 0,
    },
  ];
}

async function getPositions(userAddress: string): Promise<EarnPosition[]> {
  const xstrkAddress = getXstrkAddress();

  const balanceResult = await starknetCall(xstrkAddress, BALANCE_OF_SELECTOR, [userAddress]);
  const shares = parseU256(balanceResult[0], balanceResult[1]);

  if (shares === 0n) return [];

  const sharesLow = `0x${(shares & ((1n << 128n) - 1n)).toString(16)}`;
  const sharesHigh = `0x${(shares >> 128n).toString(16)}`;

  const convertResult = await starknetCall(xstrkAddress, CONVERT_TO_ASSETS_SELECTOR, [sharesLow, sharesHigh]);
  const totalStrkValue = parseU256(convertResult[0], convertResult[1]);

  const rewards = totalStrkValue > shares ? totalStrkValue - shares : 0n;

  return [
    {
      poolContract: xstrkAddress,
      token: getStrkToken(),
      staked: formatUnits(shares, 18),
      rewards: formatUnits(rewards, 18),
      total: formatUnits(totalStrkValue, 18),
      unpooling: "0",
      unpoolTime: null,
      commissionPercent: 0,
      rewardAddress: userAddress,
      walletAddress: userAddress,
    },
  ];
}

type RpcEvent = {
  block_number?: number;
  transaction_hash?: string;
  data?: string[];
  keys?: string[];
};

type RpcEventsResponse = {
  events?: RpcEvent[];
  continuation_token?: string | null;
};

function includesAddress(event: RpcEvent, userAddress: string): boolean {
  const normalized = normalizeHex(userAddress);
  const inData = (event.data ?? []).some((entry) => normalizeHex(entry) === normalized);
  const inKeys = (event.keys ?? []).some((entry) => normalizeHex(entry) === normalized);
  return inData || inKeys;
}

function extractAmount(event: RpcEvent): string | null {
  // ERC-4626 Deposit/Withdraw events have assets as u256 in data[2..3]
  const data = event.data ?? [];
  if (data.length >= 4) {
    const assets = parseU256(data[2], data[3]);
    return `0x${assets.toString(16)}`;
  }
  return null;
}

async function getHistory(userAddress: string, opts?: { type?: string }): Promise<EarnHistoryEntry[]> {
  const xstrkAddress = getXstrkAddress();
  const token = getStrkToken();
  const latestBlock = await getLatestBlockNumber();
  const windowSize = Math.min(PAGES_TO_SCAN * BLOCKS_PER_PAGE, latestBlock);
  const fromBlock = Math.max(0, latestBlock - windowSize);

  const timestampCache = new Map<number, number>();
  const entries: EarnHistoryEntry[] = [];

  let continuationToken: string | null = null;

  do {
    const eventsResult: RpcEventsResponse = await rpcCall<RpcEventsResponse>("starknet_getEvents", [
      {
        from_block: { block_number: fromBlock },
        to_block: { block_number: latestBlock },
        address: xstrkAddress,
        chunk_size: CHUNK_SIZE,
        continuation_token: continuationToken,
      },
    ]);

    const events = eventsResult.events ?? [];
    for (const event of events) {
      const selector = event.keys?.[0];
      if (!selector) continue;

      const type = EVENT_TYPE_BY_SELECTOR.get(normalizeHex(selector));
      if (!type) continue;
      if (!event.transaction_hash || typeof event.block_number !== "number") continue;
      if (!includesAddress(event, userAddress)) continue;

      let finalTimestamp: number;
      const cached = timestampCache.get(event.block_number);
      if (cached !== undefined) {
        finalTimestamp = cached;
      } else {
        const fetched = await getBlockTimestamp(event.block_number);
        finalTimestamp = fetched ?? event.block_number;
        timestampCache.set(event.block_number, finalTimestamp);
      }

      entries.push({
        type,
        poolContract: xstrkAddress,
        txHash: event.transaction_hash,
        timestamp: finalTimestamp,
        amount: extractAmount(event),
        token,
        userAddress: normalizeHex(userAddress),
      });
    }

    continuationToken = eventsResult.continuation_token ?? null;
  } while (continuationToken);

  entries.sort((a, b) => b.timestamp - a.timestamp);

  if (opts?.type) {
    return entries.filter((entry) => entry.type === opts.type);
  }

  return entries;
}

export function createEndurAdapter(): EarnProtocolAdapter {
  return {
    protocol: PROTOCOL,
    getPools,
    getPositions,
    getHistory,
  };
}
