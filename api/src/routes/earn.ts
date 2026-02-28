import { Router, Request, Response } from "express";
import type { EarnHistoryEntry, EarnPool, EarnPosition, TaggedEarn } from "../types/earn.js";
import type { EarnProtocolAdapter } from "../lib/earn/protocols.js";
import { getEarnProtocolAdapters } from "../lib/earn/protocols.js";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

type Pagination = {
  page: number;
  limit: number;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parsePagination(req: Request): Pagination {
  const pageRaw = asString(req.query.page).trim();
  const limitRaw = asString(req.query.limit).trim();
  const page = pageRaw ? Number(pageRaw) : DEFAULT_PAGE;
  const limit = limitRaw ? Number(limitRaw) : DEFAULT_LIMIT;

  if (!Number.isInteger(page) || page < 1) {
    throw new Error("page must be a positive integer");
  }
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("limit must be a positive integer");
  }

  return { page, limit: Math.min(limit, MAX_LIMIT) };
}

function paginate<T>(items: T[], pagination: Pagination): { data: T[]; meta: Record<string, unknown> } {
  const total = items.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pagination.limit);
  const start = (pagination.page - 1) * pagination.limit;
  const end = start + pagination.limit;
  const data = items.slice(start, end);

  return {
    data,
    meta: {
      total,
      page: pagination.page,
      limit: pagination.limit,
      totalPages,
      hasNextPage: pagination.page < totalPages,
      hasPrevPage: pagination.page > 1,
    },
  };
}

function pickAdapters(
  allAdapters: EarnProtocolAdapter[],
  protocol?: string
): EarnProtocolAdapter[] {
  if (!protocol) return allAdapters;
  return allAdapters.filter((adapter) => adapter.protocol === protocol);
}

async function collectPools(
  adapters: EarnProtocolAdapter[],
  validator?: string
): Promise<TaggedEarn<EarnPool>[]> {
  const entries = await Promise.all(
    adapters.map(async (adapter) => {
      if (!adapter.getPools) return [];
      const pools = await adapter.getPools(validator);
      return pools.map((pool) => ({ protocol: adapter.protocol, data: pool }));
    })
  );
  return entries.flat();
}

async function collectPositions(
  adapters: EarnProtocolAdapter[],
  walletAddress: string
): Promise<TaggedEarn<EarnPosition>[]> {
  const entries = await Promise.all(
    adapters.map(async (adapter) => {
      const positions = await adapter.getPositions(walletAddress);
      return positions.map((position) => ({ protocol: adapter.protocol, data: position }));
    })
  );
  return entries.flat();
}

async function collectHistory(
  adapters: EarnProtocolAdapter[],
  walletAddress: string,
  type?: string
): Promise<TaggedEarn<EarnHistoryEntry>[]> {
  const entries = await Promise.all(
    adapters.map(async (adapter) => {
      if (!adapter.getHistory) return [];
      const history = await adapter.getHistory(walletAddress, { type });
      return history.map((item) => ({ protocol: adapter.protocol, data: item }));
    })
  );
  return entries.flat();
}

export function createEarnRouter(adapters: EarnProtocolAdapter[] = getEarnProtocolAdapters()): Router {
  const router = Router();

  router.get("/pools", async (req: Request, res: Response) => {
    try {
      const pagination = parsePagination(req);
      const protocol = asString(req.query.protocol).trim();
      const validator = asString(req.query.validator).trim() || undefined;
      const selected = pickAdapters(adapters, protocol);
      const tagged = await collectPools(selected, validator);
      const paged = paginate(tagged, pagination);
      return res.json({ data: paged.data, meta: paged.meta });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to fetch earn pools";
      if (msg.includes("page must") || msg.includes("limit must")) {
        return res.status(400).json({ error: msg });
      }
      return res.status(502).json({ error: msg });
    }
  });

  router.get("/positions", async (req: Request, res: Response) => {
    const walletAddress = asString(req.query.walletAddress).trim();
    if (!walletAddress) {
      return res.status(400).json({ error: "walletAddress query parameter is required" });
    }

    try {
      const pagination = parsePagination(req);
      const protocol = asString(req.query.protocol).trim();
      const selected = pickAdapters(adapters, protocol);
      const tagged = await collectPositions(selected, walletAddress);
      const paged = paginate(tagged, pagination);
      return res.json({ data: paged.data, meta: paged.meta });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to fetch earn positions";
      if (msg.includes("page must") || msg.includes("limit must")) {
        return res.status(400).json({ error: msg });
      }
      return res.status(502).json({ error: msg });
    }
  });

  router.get("/users/:address/history", async (req: Request, res: Response) => {
    const address = asString(req.params.address).trim();
    if (!address) {
      return res.status(400).json({ error: "address path parameter is required" });
    }

    try {
      const pagination = parsePagination(req);
      const protocol = asString(req.query.protocol).trim();
      const type = asString(req.query.type).trim() || undefined;
      const selected = pickAdapters(adapters, protocol);
      const tagged = await collectHistory(selected, address, type);
      tagged.sort((a, b) => b.data.timestamp - a.data.timestamp);
      const paged = paginate(tagged, pagination);
      return res.json({ data: paged.data, meta: paged.meta });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to fetch earn history";
      if (msg.includes("page must") || msg.includes("limit must")) {
        return res.status(400).json({ error: msg });
      }
      return res.status(502).json({ error: msg });
    }
  });

  return router;
}

export default createEarnRouter();
