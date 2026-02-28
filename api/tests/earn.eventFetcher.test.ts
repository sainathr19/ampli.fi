import test from "node:test";
import assert from "node:assert/strict";
import { hash } from "starknet";
import { fetchNativeStakingHistory } from "../src/lib/earn/eventFetcher.js";

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("fetchNativeStakingHistory returns empty when no events match user", async () => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : {};
    const method = body.method;

    if (method === "starknet_blockNumber") {
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: 1000 }));
    }
    if (method === "starknet_getEvents") {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: { events: [], continuation_token: null },
        })
      );
    }
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }));
  }) as typeof fetch;

  const result = await fetchNativeStakingHistory({
    rpcUrl: "https://rpc.example.com",
    poolAddresses: ["0xpool1"],
    userAddress: "0xuser123",
    tokenByPoolAddress: new Map([["0xpool1", { symbol: "STRK", address: "0xstrk", decimals: 18 }]]),
  });

  assert.equal(Array.isArray(result), true);
  assert.equal(result.length, 0);
});

test("fetchNativeStakingHistory parses stake events and filters by user", async () => {
  const stakeSelector = hash.getSelectorFromName("enter_delegation_pool");
  const userAddr = "0x0123456789abcdef";

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : {};
    const method = body.method;
    const params = body.params ?? [];

    if (method === "starknet_blockNumber") {
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: 5000 }));
    }
    if (method === "starknet_getEvents") {
          const eventsResult = params[0] ?? {};
          const address = eventsResult.address;
          if (address === "0xpool1") {
            return new Response(
              JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                result: {
                  events: [
                    {
                      block_number: 4999,
                      transaction_hash: "0xtx1",
                      keys: [stakeSelector],
                      data: [userAddr, "1000000000000000000"],
                    },
                  ],
                  continuation_token: null,
                },
              })
            );
          }
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              result: { events: [], continuation_token: null },
            })
          );
        }
    if (method === "starknet_getBlockWithTxHashes") {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: { timestamp: 1700000000 },
        })
      );
    }
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }));
  }) as typeof fetch;

  const result = await fetchNativeStakingHistory({
    rpcUrl: "https://rpc.example.com",
    poolAddresses: ["0xpool1"],
    userAddress: userAddr,
    tokenByPoolAddress: new Map([["0xpool1", { symbol: "STRK", address: "0xstrk", decimals: 18 }]]),
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].type, "stake");
  assert.equal(result[0].poolContract, "0xpool1");
  assert.equal(result[0].txHash, "0xtx1");
  assert.equal(result[0].userAddress.toLowerCase(), userAddr.toLowerCase());
  assert.equal(result[0].timestamp, 1700000000);
});

test("fetchNativeStakingHistory handles RPC errors", async () => {
  globalThis.fetch = (async () => {
    return new Response(
      JSON.stringify({ jsonrpc: "2.0", id: 1, error: { message: "RPC error" } }),
      { status: 200 }
    );
  }) as typeof fetch;

  await assert.rejects(
    () =>
      fetchNativeStakingHistory({
        rpcUrl: "https://rpc.example.com",
        poolAddresses: ["0xpool1"],
        userAddress: "0xuser",
        tokenByPoolAddress: new Map(),
      }),
    /RPC error/
  );
});
