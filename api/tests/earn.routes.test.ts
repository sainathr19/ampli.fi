import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { createEarnRouter } from "../src/routes/earn.js";
import type { EarnProtocolAdapter } from "../src/lib/earn/protocols.js";
import type { EarnPool, EarnPosition, EarnHistoryEntry } from "../src/types/earn.js";

const mockPool: EarnPool = {
  id: "pool-1",
  poolContract: "0xpool1",
  validator: { name: "Validator A", stakerAddress: "0xval1" },
  token: { symbol: "STRK", address: "0xstrk", decimals: 18 },
  delegatedAmount: "1000",
  commissionPercent: 10,
};

const mockPosition: EarnPosition = {
  poolContract: "0xpool1",
  token: { symbol: "STRK", address: "0xstrk", decimals: 18 },
  staked: "100",
  rewards: "5",
  total: "105",
  unpooling: "0",
  unpoolTime: null,
  commissionPercent: 10,
  rewardAddress: "0xuser",
  walletAddress: "0xuser",
};

const mockHistoryEntry: EarnHistoryEntry = {
  type: "stake",
  poolContract: "0xpool1",
  txHash: "0xhash",
  timestamp: 1700000000,
  amount: "100",
  token: { symbol: "STRK", address: "0xstrk", decimals: 18 },
  userAddress: "0xuser",
};

function createMockAdapter(protocol: string): EarnProtocolAdapter {
  return {
    protocol,
    getPools: async () => [mockPool],
    getPositions: async () => [mockPosition],
    getHistory: async () => [mockHistoryEntry],
  };
}

function createApp(adapters?: EarnProtocolAdapter[]) {
  const app = express();
  app.use(express.json());
  app.use("/api/earn", createEarnRouter(adapters ?? [createMockAdapter("native_staking")]));
  return app;
}

test("GET /api/earn/pools returns tagged paginated pools", async () => {
  const res = await request(createApp()).get("/api/earn/pools?page=1&limit=10");

  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].protocol, "native_staking");
  assert.equal(res.body.data[0].data.id, "pool-1");
  assert.equal(res.body.data[0].data.poolContract, "0xpool1");
  assert.equal(res.body.meta.total, 1);
  assert.equal(res.body.meta.page, 1);
  assert.equal(res.body.meta.limit, 10);
});

test("GET /api/earn/pools filters by protocol", async () => {
  const adapters = [
    createMockAdapter("native_staking"),
    createMockAdapter("other_protocol"),
  ];
  const res = await request(createApp(adapters)).get("/api/earn/pools?protocol=native_staking");

  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].protocol, "native_staking");
});

test("GET /api/earn/pools returns 400 on invalid page", async () => {
  const res = await request(createApp()).get("/api/earn/pools?page=0");

  assert.equal(res.status, 400);
  assert.match(res.body.error, /page must be a positive integer/);
});

test("GET /api/earn/positions requires walletAddress", async () => {
  const res = await request(createApp()).get("/api/earn/positions");

  assert.equal(res.status, 400);
  assert.equal(res.body.error, "walletAddress query parameter is required");
});

test("GET /api/earn/positions returns tagged paginated positions", async () => {
  const res = await request(createApp()).get(
    "/api/earn/positions?walletAddress=0xuser&page=1&limit=10"
  );

  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].protocol, "native_staking");
  assert.equal(res.body.data[0].data.walletAddress, "0xuser");
  assert.equal(res.body.data[0].data.staked, "100");
  assert.equal(res.body.meta.total, 1);
});

test("GET /api/earn/positions filters by protocol", async () => {
  const adapters = [
    createMockAdapter("native_staking"),
    createMockAdapter("other"),
  ];
  const res = await request(createApp(adapters)).get(
    "/api/earn/positions?walletAddress=0xuser&protocol=native_staking"
  );

  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].protocol, "native_staking");
});

test("GET /api/earn/users/:address/history returns 400 on invalid page", async () => {
  const res = await request(createApp()).get("/api/earn/users/0xuser/history?page=0");

  assert.equal(res.status, 400);
  assert.match(res.body.error, /page must be a positive integer/);
});

test("GET /api/earn/users/:address/history returns tagged paginated history", async () => {
  const res = await request(createApp()).get(
    "/api/earn/users/0xuser/history?page=1&limit=10"
  );

  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].protocol, "native_staking");
  assert.equal(res.body.data[0].data.type, "stake");
  assert.equal(res.body.data[0].data.txHash, "0xhash");
  assert.equal(res.body.data[0].data.userAddress, "0xuser");
  assert.equal(res.body.meta.total, 1);
});

test("GET /api/earn/users/:address/history filters by type", async () => {
  const adapterWithFilteredHistory: EarnProtocolAdapter = {
    protocol: "native_staking",
    getPools: async () => [],
    getPositions: async () => [],
    getHistory: async (_addr, opts) =>
      opts?.type === "claim" ? [mockHistoryEntry] : [],
  };
  const res = await request(createApp([adapterWithFilteredHistory])).get(
    "/api/earn/users/0xuser/history?type=claim"
  );

  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
});

test("GET /api/earn/pools paginates correctly", async () => {
  const adapterWithManyPools: EarnProtocolAdapter = {
    protocol: "native_staking",
    getPools: async () =>
      [1, 2, 3, 4, 5].map((i) => ({
        ...mockPool,
        id: `pool-${i}`,
      })),
    getPositions: async () => [],
  };
  const res = await request(createApp([adapterWithManyPools])).get(
    "/api/earn/pools?page=2&limit=2"
  );

  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 2);
  assert.equal(res.body.meta.total, 5);
  assert.equal(res.body.meta.page, 2);
  assert.equal(res.body.meta.limit, 2);
  assert.equal(res.body.meta.totalPages, 3);
  assert.equal(res.body.meta.hasNextPage, true);
  assert.equal(res.body.meta.hasPrevPage, true);
});
