import test from "node:test";
import assert from "node:assert/strict";
import { AtomiqSdkClient } from "../src/lib/bridge/atomiqClient.js";
import { BridgeService } from "../src/lib/bridge/bridgeService.js";
import { BridgeRepository, CreateBridgeOrderArgs } from "../src/lib/bridge/repository.js";
import { settings } from "../src/lib/settings.js";
import { BridgeOrder, BridgeOrderPage } from "../src/lib/bridge/types.js";

const runLiveTestnet = process.env.RUN_BRIDGE_TESTNET_E2E === "1";
const receiveAddress =
  process.env.BRIDGE_TESTNET_RECEIVE_ADDRESS ??
  "0x02bbb9201cab480c1409518b6e4f3e62f330be84c8d8428a2202ff2cce725362";
const walletAddress = process.env.BRIDGE_TESTNET_WALLET_ADDRESS ?? receiveAddress;
const destinationAsset = (process.env.BRIDGE_TESTNET_DEST_ASSET ?? "WBTC").toUpperCase();
const amount = process.env.BRIDGE_TESTNET_AMOUNT ?? "30038";

class InMemoryBridgeRepository implements BridgeRepository {
  private readonly orders = new Map<string, BridgeOrder>();

  async init(): Promise<void> {}

  async createOrder(args: CreateBridgeOrderArgs): Promise<BridgeOrder> {
    const id = `order-${this.orders.size + 1}`;
    const now = new Date().toISOString();
    const order: BridgeOrder = {
      id,
      network: args.input.network,
      sourceAsset: args.input.sourceAsset,
      destinationAsset: args.input.destinationAsset,
      amount: args.input.amount,
      amountType: args.input.amountType,
      amountSource: args.amountSource ?? null,
      amountDestination: args.amountDestination ?? null,
      depositAddress: args.depositAddress ?? null,
      receiveAddress: args.input.receiveAddress,
      walletAddress: args.input.walletAddress,
      status: args.status,
      atomiqSwapId: args.atomiqSwapId ?? null,
      sourceTxId: null,
      destinationTxId: null,
      quote: args.quote ?? null,
      expiresAt: args.expiresAt ?? null,
      lastError: null,
      rawState: args.rawState ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.orders.set(id, order);
    return order;
  }

  async getOrderById(id: string): Promise<BridgeOrder | null> {
    return this.orders.get(id) ?? null;
  }

  async listOrdersByWallet(walletAddressValue: string): Promise<BridgeOrderPage> {
    const data = Array.from(this.orders.values()).filter((order) => order.walletAddress === walletAddressValue);
    return {
      data,
      meta: {
        total: data.length,
        page: 1,
        limit: 20,
        totalPages: data.length ? 1 : 0,
        hasNextPage: false,
        hasPrevPage: false,
      },
    };
  }

  async updateOrder(): Promise<BridgeOrder> {
    throw new Error("updateOrder is not used in this integration test");
  }

  async addAction(): Promise<void> {}

  async addEvent(): Promise<void> {}

  async getActiveOrders(): Promise<BridgeOrder[]> {
    return [];
  }
}

const skipReason =
  !runLiveTestnet
    ? "Set RUN_BRIDGE_TESTNET_E2E=1 to enable live testnet order creation test"
    : settings.network !== "testnet"
      ? `Settings network must be testnet (current: ${settings.network})`
      : false;

test(
  "BridgeService creates a live testnet order with depositAddress",
  { skip: skipReason, timeout: 120_000 },
  async () => {
    const service = new BridgeService(new InMemoryBridgeRepository(), new AtomiqSdkClient());
    const order = await service.createOrder({
      network: "testnet",
      sourceAsset: "BTC",
      destinationAsset,
      amount,
      amountType: "exactIn",
      receiveAddress,
      walletAddress,
    });

    assert.ok(order.atomiqSwapId, "Expected Atomiq swap id");
    assert.ok(order.depositAddress, "Expected non-null depositAddress");
    assert.equal(order.quote?.depositAddress, order.depositAddress);
  }
);
