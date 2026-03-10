import { Router, Request, Response } from "express";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
};

export function createProxyRouter(): Router {
  const router = Router();

  // Handle CORS preflight for all proxy routes
  router.options("/*", (_req: Request, res: Response) => {
    res.set(CORS_HEADERS).status(204).end();
  });

  // Proxy mempool.space requests (used by Atomiq SDK on frontend)
  router.all("/mempool/*", async (req: Request, res: Response) => {
    const targetPath = req.params[0];
    const targetUrl = `https://mempool.space/${targetPath}`;
    try {
      const response = await fetch(targetUrl, {
        method: req.method,
        headers: {
          "Content-Type": req.headers["content-type"] ?? "application/json",
          Accept: req.headers.accept ?? "application/json",
        },
        body: req.method !== "GET" && req.method !== "HEAD" ? JSON.stringify(req.body) : undefined,
      });
      const contentType = response.headers.get("content-type") ?? "application/json";
      res.status(response.status).set(CORS_HEADERS).set("Content-Type", contentType);
      const text = await response.text();
      return res.send(text);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Proxy request failed";
      return res.status(502).set(CORS_HEADERS).json({ error: msg });
    }
  });

  return router;
}
