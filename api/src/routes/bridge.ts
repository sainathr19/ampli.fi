import { Request, Response, Router } from "express";
import { log } from "../lib/logger.js";
import { BridgeService } from "../lib/bridge/bridgeService.js";
import { PgBridgeRepository } from "../lib/bridge/repository.js";
import {
  normalizeWalletAddress,
  validateAction,
  validateCreateOrderPayload,
  validatePositiveIntegerString,
  validateStatus,
} from "../lib/bridge/validation.js";

let servicePromise: Promise<BridgeService> | null = null;

async function getService(): Promise<BridgeService> {
  if (servicePromise) return servicePromise;
  servicePromise = (async () => {
    const repository = PgBridgeRepository.fromSettings();
    const service = new BridgeService(repository);
    await service.init();
    return service;
  })();
  return servicePromise;
}

function isBadRequestMessage(message: string): boolean {
  return (
    message.includes("required") ||
    message.includes("must be") ||
    message.includes("unsupported") ||
    message.includes("positive integer") ||
    message.includes("Cannot transition")
  );
}

function handleRouteError(res: Response, error: unknown): Response {
  const message = error instanceof Error ? error.message : "Bridge request failed";
  if (message === "Bridge order not found") {
    return res.status(404).json({ error: message });
  }
  if (isBadRequestMessage(message)) {
    return res.status(400).json({ error: message });
  }
  return res.status(500).json({ error: message });
}

const router = Router();

// Create a new tracking order
router.post("/orders", async (req: Request, res: Response) => {
  log.info("bridge POST /orders", {
    destinationAsset: (req.body as Record<string, unknown>)?.destinationAsset,
    amount: (req.body as Record<string, unknown>)?.amount,
    action: (req.body as Record<string, unknown>)?.action,
  });
  try {
    const payload = validateCreateOrderPayload(req.body);
    const service = await getService();
    const order = await service.createOrder(payload);
    return res.status(201).json({
      data: {
        orderId: order.id,
        status: order.status,
        createdAt: order.createdAt,
      },
    });
  } catch (error: unknown) {
    return handleRouteError(res, error);
  }
});

// Get order by ID
router.get("/orders/:id", async (req: Request, res: Response) => {
  try {
    const orderId = req.params.id?.trim();
    if (!orderId) return res.status(400).json({ error: "order id is required" });
    const service = await getService();
    const order = await service.getOrder(orderId);
    return res.json({ data: order });
  } catch (error: unknown) {
    return handleRouteError(res, error);
  }
});

// List orders by wallet address
router.get("/orders", async (req: Request, res: Response) => {
  try {
    const walletAddress = normalizeWalletAddress(String(req.query.walletAddress ?? ""));
    if (!walletAddress) return res.status(400).json({ error: "walletAddress query parameter is required" });
    const page = validatePositiveIntegerString(req.query.page ?? "1", "page");
    const limit = validatePositiveIntegerString(req.query.limit ?? "20", "limit");
    const action = req.query.action ? validateAction(req.query.action) : undefined;
    const service = await getService();
    const result = await service.listOrders(walletAddress, page, limit, action);
    return res.json(result);
  } catch (error: unknown) {
    return handleRouteError(res, error);
  }
});

// Link atomiq swap ID to order (frontend reports after creating swap)
router.patch("/orders/:id/atomiq-swap-id", async (req: Request, res: Response) => {
  try {
    const orderId = req.params.id?.trim();
    if (!orderId) return res.status(400).json({ error: "order id is required" });
    const atomiqSwapId = String((req.body as Record<string, unknown>)?.atomiqSwapId ?? "").trim();
    if (!atomiqSwapId) return res.status(400).json({ error: "atomiqSwapId is required" });
    const service = await getService();
    const order = await service.linkAtomiqSwapId(orderId, atomiqSwapId);
    return res.json({ data: order });
  } catch (error: unknown) {
    return handleRouteError(res, error);
  }
});

// Link BTC transaction hash to order (frontend reports after sending BTC)
router.patch("/orders/:id/btc-tx", async (req: Request, res: Response) => {
  try {
    const orderId = req.params.id?.trim();
    if (!orderId) return res.status(400).json({ error: "order id is required" });
    const btcTxHash = String((req.body as Record<string, unknown>)?.btcTxHash ?? "").trim();
    if (!btcTxHash) return res.status(400).json({ error: "btcTxHash is required" });
    const service = await getService();
    const order = await service.linkBtcTxHash(orderId, btcTxHash);
    return res.json({ data: order });
  } catch (error: unknown) {
    return handleRouteError(res, error);
  }
});

// Update order status (frontend reports milestones)
router.patch("/orders/:id/status", async (req: Request, res: Response) => {
  try {
    const orderId = req.params.id?.trim();
    if (!orderId) return res.status(400).json({ error: "order id is required" });
    const body = (req.body ?? {}) as Record<string, unknown>;
    const status = validateStatus(body.status);
    const service = await getService();
    const order = await service.updateStatus(orderId, status, {
      destinationTxId: body.destinationTxId ? String(body.destinationTxId) : undefined,
      lastError: body.lastError ? String(body.lastError) : undefined,
    });
    return res.json({ data: order });
  } catch (error: unknown) {
    return handleRouteError(res, error);
  }
});

export default router;
