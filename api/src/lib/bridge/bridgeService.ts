import { log } from "../logger.js";
import { BridgeRepository } from "./repository.js";
import { BridgeCreateOrderInput, BridgeOrder, BridgeOrderAction, BridgeOrderPage, BridgeOrderStatus } from "./types.js";

const MAX_LIST_LIMIT = 100;

function validatePagination(pageRaw: unknown, limitRaw: unknown): { page: number; limit: number } {
  const page = Number(pageRaw ?? 1);
  const limit = Number(limitRaw ?? 20);

  if (!Number.isInteger(page) || page < 1) {
    throw new Error("page must be a positive integer");
  }
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("limit must be a positive integer");
  }
  return { page, limit: Math.min(limit, MAX_LIST_LIMIT) };
}

const VALID_STATUS_TRANSITIONS: Record<string, BridgeOrderStatus[]> = {
  CREATED: ["SWAP_CREATED", "FAILED", "EXPIRED"],
  SWAP_CREATED: ["BTC_SENT", "FAILED", "EXPIRED"],
  BTC_SENT: ["BTC_CONFIRMED", "FAILED"],
  BTC_CONFIRMED: ["CLAIMING", "SETTLED", "FAILED"],
  CLAIMING: ["SETTLED", "FAILED"],
  SETTLED: [],
  FAILED: [],
  EXPIRED: [],
  REFUNDED: [],
};

export class BridgeService {
  constructor(private readonly repository: BridgeRepository) {}

  async init(): Promise<void> {
    await this.repository.init();
  }

  async createOrder(input: BridgeCreateOrderInput): Promise<BridgeOrder> {
    log.info("bridge createOrder", {
      network: input.network,
      destinationAsset: input.destinationAsset,
      amount: input.amount,
      action: input.action,
    });
    const order = await this.repository.createOrder(input);
    log.info("bridge createOrder success", { orderId: order.id });
    return order;
  }

  async getOrder(orderId: string): Promise<BridgeOrder> {
    return this.requireOrder(orderId);
  }

  async listOrders(walletAddress: string, pageRaw: unknown, limitRaw: unknown, action?: BridgeOrderAction): Promise<BridgeOrderPage> {
    const { page, limit } = validatePagination(pageRaw, limitRaw);
    return this.repository.listOrdersByWallet(walletAddress.toLowerCase(), page, limit, action);
  }

  async linkAtomiqSwapId(orderId: string, atomiqSwapId: string): Promise<BridgeOrder> {
    const order = await this.requireOrder(orderId);
    log.info("bridge linkAtomiqSwapId", { orderId, atomiqSwapId });
    return this.repository.updateOrder(order.id, {
      atomiqSwapId,
      status: "SWAP_CREATED",
    });
  }

  async linkBtcTxHash(orderId: string, btcTxHash: string): Promise<BridgeOrder> {
    const order = await this.requireOrder(orderId);
    log.info("bridge linkBtcTxHash", { orderId, btcTxHash });
    return this.repository.updateOrder(order.id, {
      sourceTxId: btcTxHash,
      status: "BTC_SENT",
    });
  }

  async updateStatus(
    orderId: string,
    status: BridgeOrderStatus,
    payload?: { destinationTxId?: string; lastError?: string }
  ): Promise<BridgeOrder> {
    const order = await this.requireOrder(orderId);

    const allowed = VALID_STATUS_TRANSITIONS[order.status];
    if (allowed && !allowed.includes(status)) {
      throw new Error(`Cannot transition from ${order.status} to ${status}`);
    }

    log.info("bridge updateStatus", { orderId, from: order.status, to: status });
    return this.repository.updateOrder(order.id, {
      status,
      destinationTxId: payload?.destinationTxId ?? null,
      lastError: payload?.lastError ?? null,
    });
  }

  async linkSupplyTx(orderId: string, supplyTxId: string): Promise<BridgeOrder> {
    const order = await this.requireOrder(orderId);
    log.info("bridge linkSupplyTx", { orderId, supplyTxId });
    return this.repository.updateOrder(order.id, { supplyTxId });
  }

  async linkBorrowTx(orderId: string, borrowTxId: string): Promise<BridgeOrder> {
    const order = await this.requireOrder(orderId);
    log.info("bridge linkBorrowTx", { orderId, borrowTxId });
    return this.repository.updateOrder(order.id, { borrowTxId });
  }

  private async requireOrder(orderId: string): Promise<BridgeOrder> {
    const order = await this.repository.getOrderById(orderId);
    if (!order) {
      throw new Error("Bridge order not found");
    }
    return order;
  }
}
