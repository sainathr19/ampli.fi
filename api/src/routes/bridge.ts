import { Request, Response, Router } from "express";
import { log } from "../lib/logger.js";
import { AtomiqSdkClient } from "../lib/bridge/atomiqClient.js";
import { BridgeService } from "../lib/bridge/bridgeService.js";
import { PgBridgeRepository } from "../lib/bridge/repository.js";
import { settings } from "../lib/settings.js";
import {
  normalizeWalletAddress,
  validateCreateOrderPayload,
  validatePositiveIntegerString,
} from "../lib/bridge/validation.js";

let bridgeServicePromise: Promise<BridgeService> | null = null;

async function getBridgeService(): Promise<BridgeService> {
  if (bridgeServicePromise) {
    return bridgeServicePromise;
  }

  bridgeServicePromise = (async () => {
    const repository = PgBridgeRepository.fromSettings();
    const atomiqClient = new AtomiqSdkClient();
    const service = new BridgeService(repository, atomiqClient);
    await service.init();
    service.startRecoveryPoller(settings.bridge_recovery_interval_ms);
    return service;
  })();

  return bridgeServicePromise;
}

function isBadRequestMessage(message: string): boolean {
  return (
    message.includes("required") ||
    message.includes("must be") ||
    message.includes("unsupported") ||
    message.includes("positive integer") ||
    message.includes("expired")
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
  return res.status(502).json({ error: message });
}

type BridgeServiceLike = Pick<
  BridgeService,
  "createOrder" | "getOrder" | "listOrders" | "retryOrder"
>;

export function createBridgeRouter(serviceResolver: () => Promise<BridgeServiceLike>): Router {
  const router = Router();

  router.post("/orders", async (req: Request, res: Response) => {
    log.info("bridge route POST /orders", {
      network: (req.body as Record<string, unknown>)?.network,
      destinationAsset: (req.body as Record<string, unknown>)?.destinationAsset,
      amount: (req.body as Record<string, unknown>)?.amount,
      amountType: (req.body as Record<string, unknown>)?.amountType,
    });
    try {
      const payload = validateCreateOrderPayload(req.body);
      const service = await serviceResolver();
      const order = await service.createOrder(payload);
      const quote = order.quote ?? {};
      return res.status(201).json({
        data: {
          orderId: order.id,
          status: order.status,
          depositAddress: quote.depositAddress ?? null,
          amountSats: quote.amountIn ?? null,
          quote: order.quote,
          expiresAt: order.expiresAt,
        },
      });
    } catch (error: unknown) {
      return handleRouteError(res, error);
    }
  });

  router.get("/orders/:id", async (req: Request, res: Response) => {
    log.info("bridge route GET /orders/:id", { orderId: req.params.id });
    try {
      const orderId = req.params.id?.trim();
      if (!orderId) {
        return res.status(400).json({ error: "order id is required" });
      }
      const service = await serviceResolver();
      const order = await service.getOrder(orderId);
      return res.json({ data: order });
    } catch (error: unknown) {
      return handleRouteError(res, error);
    }
  });

  router.get("/orders", async (req: Request, res: Response) => {
    log.info("bridge route GET /orders", {
      walletAddress: req.query.walletAddress,
      page: req.query.page,
      limit: req.query.limit,
    });
    try {
      const walletAddress = normalizeWalletAddress(String(req.query.walletAddress ?? ""));
      if (!walletAddress) {
        return res.status(400).json({ error: "walletAddress query parameter is required" });
      }
      const page = validatePositiveIntegerString(req.query.page ?? "1", "page");
      const limit = validatePositiveIntegerString(req.query.limit ?? "20", "limit");

      const service = await serviceResolver();
      const result = await service.listOrders(walletAddress, page, limit);
      return res.json(result);
    } catch (error: unknown) {
      return handleRouteError(res, error);
    }
  });

  router.post("/orders/:id/retry", async (req: Request, res: Response) => {
    log.info("bridge route POST /orders/:id/retry", { orderId: req.params.id });
    try {
      const orderId = req.params.id?.trim();
      if (!orderId) {
        return res.status(400).json({ error: "order id is required" });
      }
      const service = await serviceResolver();
      const order = await service.retryOrder(orderId);
      return res.json({ data: order });
    } catch (error: unknown) {
      return handleRouteError(res, error);
    }
  });

  return router;
}

export default createBridgeRouter(getBridgeService);
