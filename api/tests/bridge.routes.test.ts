import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { createBridgeRouter } from "../src/routes/bridge.js";
import { BridgeOrder, BridgeOrderPage } from "../src/lib/bridge/types.js";

function makeOrder(overrides: Partial<BridgeOrder> = {}): BridgeOrder {
  return {
    id: "order-1",
    network: "testnet",
    sourceAsset: "BTC",
    destinationAsset: "USDC",
    amount: "100000",
    amountType: "exactIn",
    amountSource: "100000",
    amountDestination: "99700000",
    receiveAddress: "0x0123",
    walletAddress: "0xwallet",
    status: "CREATED",
    atomiqSwapId: "swap-1",
    sourceTxId: null,
    destinationTxId: null,
    quote: {},
    expiresAt: null,
    lastError: null,
    rawState: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeEmptyPage(): BridgeOrderPage {
  return {
    data: [],
    meta: {
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
      hasNextPage: false,
      hasPrevPage: false,
    },
  };
}

function createApp(service: {
  createOrder: (...args: unknown[]) => Promise<BridgeOrder>;
  getOrder: (...args: unknown[]) => Promise<BridgeOrder>;
  listOrders: (...args: unknown[]) => Promise<BridgeOrderPage>;
  retryOrder: (...args: unknown[]) => Promise<BridgeOrder>;
}) {
  const app = express();
  app.use(express.json());
  app.use("/api/bridge", createBridgeRouter(async () => service));
  return app;
}

test("POST /api/bridge/orders validates Starknet receive address", async () => {
  const app = createApp({
    createOrder: async () => makeOrder(),
    getOrder: async () => makeOrder(),
    listOrders: async () => makeEmptyPage(),
    retryOrder: async () => makeOrder(),
  });

  const res = await request(app).post("/api/bridge/orders").send({
    sourceAsset: "BTC",
    destinationAsset: "USDC",
    amount: "10000",
    amountType: "exactIn",
    receiveAddress: "not-a-starknet-address",
    walletAddress: "0xabc",
  });

  assert.equal(res.status, 400);
  assert.match(res.body.error, /receiveAddress must be a valid Starknet address/);
});

test("POST /api/bridge/orders creates order with deposit address and amount", async () => {
  const app = createApp({
    createOrder: async () =>
      makeOrder({
        status: "CREATED",
        quote: {
          amountIn: "10000",
          amountOut: "99700000",
          depositAddress: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
        },
        expiresAt: "2030-01-01T00:00:00.000Z",
      }),
    getOrder: async () => makeOrder(),
    listOrders: async () => makeEmptyPage(),
    retryOrder: async () => makeOrder(),
  });

  const res = await request(app).post("/api/bridge/orders").send({
    sourceAsset: "BTC",
    destinationAsset: "USDC",
    amount: "10000",
    amountType: "exactIn",
    receiveAddress:
      "0x0123456789012345678901234567890123456789012345678901234567890123",
    walletAddress: "0xabc",
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.data.orderId, "order-1");
  assert.equal(res.body.data.status, "CREATED");
  assert.equal(res.body.data.depositAddress, "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh");
  assert.equal(res.body.data.amountSats, "10000");
});

