import { Request, Response, Router } from "express";
import { AtomiqSdkClient } from "../lib/bridge/atomiqClient.js";
import { BridgeService } from "../lib/bridge/bridgeService.js";
import { PgBridgeRepository } from "../lib/bridge/repository.js";
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
    const repository = PgBridgeRepository.fromEnv();
    const atomiqClient = new AtomiqSdkClient();
    const service = new BridgeService(repository, atomiqClient);
    await service.init();
    service.startRecoveryPoller();
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
  "createOrder" | "prepareOrder" | "submitOrder" | "getOrder" | "listOrders" | "retryOrder"
>;

export function createBridgeRouter(serviceResolver: () => Promise<BridgeServiceLike>): Router {
  const router = Router();

  router.post("/orders", async (req: Request, res: Response) => {
    try {
      const payload = validateCreateOrderPayload(req.body);
      const service = await serviceResolver();
      const order = await service.createOrder(payload);
      return res.status(201).json({
        data: {
          orderId: order.id,
          status: order.status,
          quote: order.quote,
          expiresAt: order.expiresAt,
        },
      });
    } catch (error: unknown) {
      return handleRouteError(res, error);
    }
  });

  router.post("/orders/:id/prepare", async (req: Request, res: Response) => {
    try {
      const orderId = req.params.id?.trim();
      if (!orderId) {
        return res.status(400).json({ error: "order id is required" });
      }

      const service = await serviceResolver();
      const result = await service.prepareOrder(orderId);
      return res.json({
        data: {
          orderId: result.order.id,
          status: result.order.status,
          action: result.payload,
        },
      });
    } catch (error: unknown) {
      return handleRouteError(res, error);
    }
  });

  router.post("/orders/:id/submit", async (req: Request, res: Response) => {
    try {
      const orderId = req.params.id?.trim();
      if (!orderId) {
        return res.status(400).json({ error: "order id is required" });
      }

      const body = (req.body ?? {}) as Record<string, unknown>;
      const signedPsbtBase64 = typeof body.signedPsbtBase64 === "string" ? body.signedPsbtBase64.trim() : "";
      const sourceTxId = typeof body.sourceTxId === "string" ? body.sourceTxId.trim() : "";
      if (!signedPsbtBase64 && !sourceTxId) {
        return res.status(400).json({ error: "signedPsbtBase64 or sourceTxId is required" });
      }

      const service = await serviceResolver();
      const order = await service.submitOrder(orderId, {
        signedPsbtBase64: signedPsbtBase64 || undefined,
        sourceTxId: sourceTxId || undefined,
      });
      return res.json({ data: order });
    } catch (error: unknown) {
      return handleRouteError(res, error);
    }
  });

  router.get("/orders/:id", async (req: Request, res: Response) => {
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
