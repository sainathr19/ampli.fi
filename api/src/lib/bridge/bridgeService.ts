import { log } from "../logger.js";
import { runWithTraceAsync } from "../trace.js";
import { AtomiqClient } from "./atomiqClient.js";
import { BridgeRepository } from "./repository.js";
import { mapAtomiqStateToOrderStatus } from "./stateMapper.js";
import { BridgeCreateOrderInput, BridgeOrder, BridgeOrderPage } from "./types.js";

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

export class BridgeService {
  private poller: NodeJS.Timeout | null = null;

  constructor(
    private readonly repository: BridgeRepository,
    private readonly atomiqClient: AtomiqClient
  ) {}

  async init(): Promise<void> {
    await this.repository.init();
  }

  startRecoveryPoller(intervalMs = 30000): void {
    if (this.poller) return;
    this.poller = setInterval(() => {
      const traceId = `recovery-${Date.now()}`;
      runWithTraceAsync(traceId, () =>
        this.reconcileActiveOrders().catch((error: unknown) => {
          const msg = error instanceof Error ? error.message : String(error);
          log.error("bridge recovery poller error", { error: msg });
        })
      );
    }, intervalMs);
  }

  stopRecoveryPoller(): void {
    if (this.poller) {
      clearInterval(this.poller);
      this.poller = null;
    }
  }

  async createOrder(input: BridgeCreateOrderInput): Promise<BridgeOrder> {
    log.info("bridge createOrder start", {
      network: input.network,
      destinationAsset: input.destinationAsset,
      amount: input.amount,
      receiveAddress: input.receiveAddress,
    });
    const swap = await this.atomiqClient.createIncomingSwap({
      network: input.network,
      destinationAsset: input.destinationAsset,
      amount: input.amount,
      amountType: input.amountType,
      receiveAddress: input.receiveAddress,
    });

    const order = await this.repository.createOrder({
      input,
      status: "CREATED",
      atomiqSwapId: swap.atomiqSwapId,
      quote: swap.quote,
      expiresAt: swap.expiresAt,
      rawState: { state: String(swap.statusRaw ?? "") },
      amountSource: swap.amountSource,
      amountDestination: swap.amountDestination,
    });

    await this.repository.addAction(order.id, "CREATE_ORDER", "SUCCESS", {
      atomiqSwapId: order.atomiqSwapId,
    });
    await this.repository.addEvent(order.id, "ORDER_CREATED", null, "CREATED", {
      quote: order.quote,
      expiresAt: order.expiresAt,
    });
    log.info("bridge createOrder success", {
      orderId: order.id,
      atomiqSwapId: order.atomiqSwapId,
      status: order.status,
    });
    return order;
  }

  async getOrder(orderId: string): Promise<BridgeOrder> {
    return this.requireOrder(orderId);
  }

  async listOrders(walletAddress: string, pageRaw: unknown, limitRaw: unknown): Promise<BridgeOrderPage> {
    const { page, limit } = validatePagination(pageRaw, limitRaw);
    return this.repository.listOrdersByWallet(walletAddress.toLowerCase(), page, limit);
  }

  async retryOrder(orderId: string): Promise<BridgeOrder> {
    log.info("bridge retryOrder start", { orderId });
    const order = await this.requireOrder(orderId);
    await this.repository.addAction(order.id, "MANUAL_RETRY", "SUCCESS");
    const result = await this.reconcileOrder(order.id);
    log.info("bridge retryOrder success", { orderId, status: result.status });
    return result;
  }

  async reconcileActiveOrders(): Promise<void> {
    const activeOrders = await this.repository.getActiveOrders(100);
    log.info("bridge reconcileActiveOrders start", { count: activeOrders.length });
    for (const order of activeOrders) {
      await this.reconcileOrder(order.id);
    }
    log.info("bridge reconcileActiveOrders done", { count: activeOrders.length });
  }

  async reconcileOrder(orderId: string): Promise<BridgeOrder> {
    const order = await this.requireOrder(orderId);
    const snapshot = await this.atomiqClient.getOrderSnapshot(order);
    log.info("bridge reconcileOrder snapshot", {
      orderId,
      statusRaw: String(snapshot.statusRaw ?? ""),
      isClaimable: snapshot.isClaimable,
      isRefundable: snapshot.isRefundable,
    });

    let nextStatus = mapAtomiqStateToOrderStatus(snapshot.statusRaw);
    let destinationTxId = snapshot.destinationTxId;
    let lastError: string | null = null;

    if (snapshot.isClaimable) {
      const claim = await this.atomiqClient.tryClaim(order);
      await this.repository.addAction(order.id, "AUTO_CLAIM", claim.success ? "SUCCESS" : "FAILED", {
        txId: claim.txId ?? null,
      });
      if (claim.success) {
        nextStatus = "SETTLED";
        destinationTxId = claim.txId ?? destinationTxId;
      } else {
        nextStatus = "CLAIMING";
      }
    } else if (snapshot.isRefundable) {
      const refund = await this.atomiqClient.tryRefund(order);
      await this.repository.addAction(order.id, "AUTO_REFUND", refund.success ? "SUCCESS" : "FAILED", {
        txId: refund.txId ?? null,
      });
      if (refund.success) {
        nextStatus = "REFUNDED";
        destinationTxId = refund.txId ?? destinationTxId;
      } else {
        nextStatus = "REFUNDING";
      }
    }

    const updated = await this.repository.updateOrder(order.id, {
      status: nextStatus,
      sourceTxId: snapshot.sourceTxId ?? order.sourceTxId,
      destinationTxId,
      rawState: snapshot.rawState,
      lastError,
    });
    await this.repository.addAction(order.id, "POLL_ORDER", "SUCCESS", {
      statusRaw: String(snapshot.statusRaw ?? ""),
      mappedStatus: nextStatus,
      sourceTxId: snapshot.sourceTxId,
      destinationTxId,
    });
    await this.repository.addEvent(order.id, "ORDER_RECONCILED", order.status, updated.status, {
      statusRaw: String(snapshot.statusRaw ?? ""),
      sourceTxId: snapshot.sourceTxId,
      destinationTxId,
    });
    log.info("bridge reconcileOrder success", {
      orderId: order.id,
      fromStatus: order.status,
      toStatus: updated.status,
      destinationTxId,
    });
    return updated;
  }

  private async requireOrder(orderId: string): Promise<BridgeOrder> {
    const order = await this.repository.getOrderById(orderId);
    if (!order) {
      throw new Error("Bridge order not found");
    }
    return order;
  }
}
