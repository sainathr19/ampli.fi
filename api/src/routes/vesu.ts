import { Router, Request, Response } from "express";

const router = Router();

const VESU_URL = (process.env.VESU_API_URL || "https://api.vesu.xyz").replace(/\/+$/, "");

async function proxyVesu(req: Request, res: Response) {
  try {
    const subPath = (req.params as { path?: string }).path ?? req.path?.replace(/^\//, "") ?? "";
    const targetUrl = new URL(subPath ? `${VESU_URL}/${subPath}` : VESU_URL);

    for (const [key, value] of Object.entries(req.query)) {
      if (Array.isArray(value)) {
        value.forEach((entry) => targetUrl.searchParams.append(key, String(entry)));
      } else if (value !== undefined) {
        targetUrl.searchParams.set(key, String(value));
      }
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (req.body && req.method !== "GET" && req.method !== "HEAD") {
      headers["Content-Type"] = "application/json";
    }

    const fetchOpts: RequestInit = {
      method: req.method,
      headers,
    };

    if (req.method !== "GET" && req.method !== "HEAD" && req.body) {
      fetchOpts.body = JSON.stringify(req.body);
    }

    const upstream = await fetch(targetUrl.toString(), fetchOpts);
    const text = await upstream.text();

    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (!["content-encoding", "transfer-encoding", "connection"].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    return res.send(text);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Vesu proxy failed";
    console.error("Vesu proxy error:", msg);
    return res.status(502).json({ error: msg });
  }
}

router.all("*", proxyVesu);

export default router;
