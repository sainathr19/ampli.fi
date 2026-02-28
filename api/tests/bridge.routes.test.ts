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
    depositAddress: "bc1qdefaultaddress000000000000000000000000000",
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
        amount: "10000",
        depositAddress: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
        quote: {
          amountIn: "10000",
          amountOut: "99700000",
          depositAddress: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
          bitcoinPayment: {
            type: "ADDRESS",
            address: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
            amountSats: "10000",
            hyperlink: "bitcoin:bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh?amount=0.0001",
          },
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
  assert.equal(res.body.data.payment.type, "ADDRESS");
});

test("POST /api/bridge/orders returns funded PSBT details when provided by Atomiq", async () => {
  const app = createApp({
    createOrder: async () =>
      makeOrder({
        status: "CREATED",
        amount: "30038",
        depositAddress: null,
        quote: {
          amountIn: "30038",
          amountOut: "29577",
          bitcoinPayment: {
            type: "FUNDED_PSBT",
            psbtHex: "70736274ff01",
            psbtBase64: "cHNidP8BAA==",
            signInputs: [1, 2],
          },
        },
        expiresAt: "2030-01-01T00:00:00.000Z",
      }),
    getOrder: async () => makeOrder(),
    listOrders: async () => makeEmptyPage(),
    retryOrder: async () => makeOrder(),
  });

  const res = await request(app).post("/api/bridge/orders").send({
    sourceAsset: "BTC",
    destinationAsset: "WBTC",
    amount: "30038",
    amountType: "exactIn",
    receiveAddress:
      "0x0123456789012345678901234567890123456789012345678901234567890123",
    walletAddress: "0xabc",
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.data.depositAddress, null);
  assert.equal(res.body.data.amountSats, "30038");
  assert.equal(res.body.data.payment.type, "FUNDED_PSBT");
  assert.equal(res.body.data.payment.psbtBase64, "cHNidP8BAA==");
  assert.deepEqual(res.body.data.payment.signInputs, [1, 2]);
});

