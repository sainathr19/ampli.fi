import test from "node:test";
import assert from "node:assert/strict";
import { BridgeService } from "../src/lib/bridge/bridgeService.js";
import { AtomiqClient } from "../src/lib/bridge/atomiqClient.js";
import { BridgeRepository, CreateBridgeOrderArgs } from "../src/lib/bridge/repository.js";
import { BridgeCreateOrderInput, BridgeOrder } from "../src/lib/bridge/types.js";

class InMemoryBridgeRepository implements BridgeRepository {
  orders = new Map<string, BridgeOrder>();
  actions: Array<{ orderId: string; type: string; status: string }> = [];

  async init(): Promise<void> {}

  async createOrder(args: CreateBridgeOrderArgs): Promise<BridgeOrder> {
    const order: BridgeOrder = {
      id: "order-1",
      network: args.input.network,
      sourceAsset: "BTC",
      destinationAsset: args.input.destinationAsset,
      amount: args.input.amount,
      amountType: args.input.amountType,
      amountSource: args.amountSource ?? null,
      amountDestination: args.amountDestination ?? null,
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.orders.set(order.id, order);
    return order;
  }

  async getOrderById(id: string): Promise<BridgeOrder | null> {
    return this.orders.get(id) ?? null;
  }

  async listOrdersByWallet(walletAddress: string): Promise<any> {
    const data = Array.from(this.orders.values()).filter((order) => order.walletAddress === walletAddress);
    return {
      data,
      meta: { total: data.length, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPrevPage: false },
    };
  }

  async updateOrder(
    id: string,
    patch: Partial<{
      status: BridgeOrder["status"];
      sourceTxId: string | null;
      destinationTxId: string | null;
      lastError: string | null;
      rawState: Record<string, unknown> | null;
      quote: Record<string, unknown> | null;
      atomiqSwapId: string | null;
      expiresAt: string | null;
    }>
  ): Promise<BridgeOrder> {
    const current = this.orders.get(id);
    if (!current) {
      throw new Error("Bridge order not found");
    }
    const updated: BridgeOrder = {
      ...current,
      status: patch.status ?? current.status,
      sourceTxId: patch.sourceTxId ?? current.sourceTxId,
      destinationTxId: patch.destinationTxId ?? current.destinationTxId,
      lastError: patch.lastError ?? current.lastError,
      rawState: patch.rawState ?? current.rawState,
      quote: patch.quote ?? current.quote,
      atomiqSwapId: patch.atomiqSwapId ?? current.atomiqSwapId,
      expiresAt: patch.expiresAt ?? current.expiresAt,
      updatedAt: new Date().toISOString(),
    };
    this.orders.set(id, updated);
    return updated;
  }

  async addAction(orderId: string, type: any, status: any): Promise<void> {
    this.actions.push({ orderId, type, status });
  }

  async addEvent(): Promise<void> {}

  async getActiveOrders(): Promise<BridgeOrder[]> {
    return Array.from(this.orders.values()).filter((order) =>
      ["CREATED", "AWAITING_USER_SIGNATURE", "SOURCE_SUBMITTED", "SOURCE_CONFIRMED", "CLAIMING", "REFUNDING"].includes(
        order.status
      )
    );
  }
}

function defaultInput(): BridgeCreateOrderInput {
  return {
    network: "testnet",
    sourceAsset: "BTC",
    destinationAsset: "USDC",
    amount: "10000",
    amountType: "exactIn",
    receiveAddress: "0x0123",
    walletAddress: "0xwallet",
  };
}

test("BridgeService create and reconcile detects Atomiq state", async () => {
  const repo = new InMemoryBridgeRepository();
  const atomiq: AtomiqClient = {
    createIncomingSwap: async () => ({
      atomiqSwapId: "swap-1",
      statusRaw: "PR_CREATED",
      quote: { amountIn: "10000", amountOut: "9700000" },
      expiresAt: "2030-01-01T00:00:00.000Z",
      amountSource: "10000",
      amountDestination: "9700000",
    }),
    getOrderSnapshot: async () => ({
      statusRaw: "BTC_TX_CONFIRMED",
      sourceTxId: "btc-tx-1",
      destinationTxId: null,
      rawState: { state: "BTC_TX_CONFIRMED" },
      isClaimable: false,
      isRefundable: false,
    }),
    tryClaim: async () => ({ success: false }),
    tryRefund: async () => ({ success: false }),
  };

  const service = new BridgeService(repo, atomiq);
  const order = await service.createOrder(defaultInput());
  assert.equal(order.status, "CREATED");
  assert.equal(order.atomiqSwapId, "swap-1");

  const reconciled = await service.reconcileOrder(order.id);
  assert.equal(reconciled.status, "SOURCE_CONFIRMED");
  assert.equal(reconciled.sourceTxId, "btc-tx-1");
});

test("BridgeService reconcile attempts auto-claim", async () => {
  const repo = new InMemoryBridgeRepository();
  await repo.createOrder({
    input: defaultInput(),
    status: "SOURCE_CONFIRMED",
    atomiqSwapId: "swap-1",
  });

  const atomiq: AtomiqClient = {
    createIncomingSwap: async () => {
      throw new Error("not used");
    },
    getOrderSnapshot: async () => ({
      statusRaw: "BTC_TX_CONFIRMED",
      sourceTxId: "btc-tx-1",
      destinationTxId: null,
      rawState: { state: "BTC_TX_CONFIRMED" },
      isClaimable: true,
      isRefundable: false,
    }),
    tryClaim: async () => ({ success: true, txId: "starknet-tx-1" }),
    tryRefund: async () => ({ success: false }),
  };

  const service = new BridgeService(repo, atomiq);
  const updated = await service.reconcileOrder("order-1");
  assert.equal(updated.status, "SETTLED");
  assert.equal(updated.destinationTxId, "starknet-tx-1");
});
