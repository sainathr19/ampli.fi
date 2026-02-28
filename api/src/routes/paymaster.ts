import { Router, Request, Response } from "express";

const router = Router();

const AVNU_URL = (process.env.PAYMASTER_URL || "https://starknet.paymaster.avnu.fi").replace(
  /\/+$/,
  ""
);
const API_KEY = (process.env.PAYMASTER_API_KEY ?? "").trim();

/**
 * Proxy for AVNU Paymaster - forwards all requests to AVNU with API key header.
 * ALL /api/paymaster/* -> AVNU Paymaster
 * Request: forwarded as-is
 * Response: forwarded from AVNU
 */
async function proxyPaymaster(req: Request, res: Response) {
  try {
    const subPath = (req.params as { path?: string }).path ?? req.path?.replace(/^\//, "") ?? "";
    const targetUrl = subPath ? `${AVNU_URL}/${subPath}` : AVNU_URL;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (API_KEY) {
      headers["x-paymaster-api-key"] = API_KEY;
    }

    const fetchOpts: RequestInit = {
      method: req.method,
      headers,
    };
    if (req.method !== "GET" && req.method !== "HEAD" && req.body) {
      fetchOpts.body = JSON.stringify(req.body);
    }

    const upstream = await fetch(targetUrl, fetchOpts);
    const text = await upstream.text();

    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (
        !["content-encoding", "transfer-encoding", "connection"].includes(key.toLowerCase())
      ) {
        res.setHeader(key, value);
      }
    });
    res.setHeader("Content-Type", "application/json");
    return res.send(text);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Paymaster proxy failed";
    console.error("Paymaster proxy error:", msg);
    return res.status(502).json({ error: msg });
  }
}

router.all("*", proxyPaymaster);

export default router;
