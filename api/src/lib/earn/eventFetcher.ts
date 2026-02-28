import { hash } from "starknet";
import type { EarnHistoryEntry, EarnHistoryType } from "../../types/earn.js";
import type { EarnToken } from "../../types/earn.js";

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

const BLOCKS_PER_PAGE = 1000;
const PAGES_TO_SCAN = 10;
const BLOCKS_PER_24_HOURS = 7200;
const CHUNK_SIZE = 200;

const EVENT_NAME_BY_SELECTOR = new Map<string, EarnHistoryType>([
  [hash.getSelectorFromName("enter_delegation_pool"), "stake"],
  [hash.getSelectorFromName("add_to_delegation_pool"), "add"],
  [hash.getSelectorFromName("claim_rewards"), "claim"],
  [hash.getSelectorFromName("exit_delegation_pool_intent"), "exit_intent"],
  [hash.getSelectorFromName("exit_delegation_pool_action"), "exit"],
]);

function normalizeHex(value: string): string {
  const sanitized = value.toLowerCase();
  return sanitized.startsWith("0x") ? sanitized : `0x${sanitized}`;
}

async function rpcCall<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(rpcUrl, {
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

async function getLatestBlockNumber(rpcUrl: string): Promise<number> {
  const latest = await rpcCall<number>(rpcUrl, "starknet_blockNumber", []);
  return Number(latest);
}

function deriveType(event: RpcEvent): EarnHistoryType | null {
  const selector = event.keys?.[0];
  if (!selector) return null;
  return EVENT_NAME_BY_SELECTOR.get(normalizeHex(selector)) ?? null;
}

function maybeAmount(event: RpcEvent, userAddress: string): string | null {
  const data = event.data ?? [];
  const normalizedUser = normalizeHex(userAddress);
  for (const entry of data) {
    const normalized = normalizeHex(entry);
    if (normalized !== normalizedUser) {
      return normalized;
    }
  }
  return null;
}

function includesAddress(event: RpcEvent, userAddress: string): boolean {
  const normalized = normalizeHex(userAddress);
  const inData = (event.data ?? []).some((entry) => normalizeHex(entry) === normalized);
  const inKeys = (event.keys ?? []).some((entry) => normalizeHex(entry) === normalized);
  return inData || inKeys;
}

async function getBlockTimestamp(rpcUrl: string, blockNumber: number): Promise<number | null> {
  const result = await rpcCall<{ timestamp?: number }>(
    rpcUrl,
    "starknet_getBlockWithTxHashes",
    [{ block_number: blockNumber }]
  );
  if (typeof result.timestamp !== "number") return null;
  return result.timestamp;
}

type FetchHistoryParams = {
  rpcUrl: string;
  poolAddresses: string[];
  userAddress: string;
  tokenByPoolAddress: Map<string, EarnToken>;
};

export async function fetchNativeStakingHistory(params: FetchHistoryParams): Promise<EarnHistoryEntry[]> {
  const latestBlock = await getLatestBlockNumber(params.rpcUrl);
  const windowSize = Math.min(PAGES_TO_SCAN * BLOCKS_PER_PAGE, BLOCKS_PER_24_HOURS);
  const fromBlock = Math.max(0, latestBlock - windowSize);
  const timestampCache = new Map<number, number>();
  const entries: EarnHistoryEntry[] = [];

  for (const poolAddress of params.poolAddresses) {
    let continuationToken: string | null = null;

    do {
      const eventsResult: RpcEventsResponse = await rpcCall<RpcEventsResponse>(
        params.rpcUrl,
        "starknet_getEvents",
        [
        {
          from_block: { block_number: fromBlock },
          to_block: { block_number: latestBlock },
          address: poolAddress,
          chunk_size: CHUNK_SIZE,
          continuation_token: continuationToken,
        },
        ]
      );

      const events = eventsResult.events ?? [];
      for (const event of events) {
        const type = deriveType(event);
        if (!type) continue;
        if (!event.transaction_hash || typeof event.block_number !== "number") continue;
        if (!includesAddress(event, params.userAddress)) continue;

        const cachedTimestamp = timestampCache.get(event.block_number);
        let finalTimestamp: number;
        if (cachedTimestamp === undefined) {
          const fetched = await getBlockTimestamp(params.rpcUrl, event.block_number);
          finalTimestamp = fetched ?? event.block_number;
          timestampCache.set(event.block_number, finalTimestamp);
        } else {
          finalTimestamp = cachedTimestamp;
        }

        entries.push({
          type,
          poolContract: poolAddress,
          txHash: event.transaction_hash,
          timestamp: finalTimestamp,
          amount: maybeAmount(event, params.userAddress),
          token: params.tokenByPoolAddress.get(normalizeHex(poolAddress)) ?? null,
          userAddress: normalizeHex(params.userAddress),
        });
      }

      continuationToken = eventsResult.continuation_token ?? null;
    } while (continuationToken);
  }

  entries.sort((a, b) => b.timestamp - a.timestamp);
  return entries;
}
