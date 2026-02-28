import { Router, Request, Response } from "express";
import { getPools, getPositions, getUserHistory } from "../lib/vesu.js";
import {
  asString,
  normalizeHistoryEntry,
  normalizePool,
  normalizePosition,
  parseOptionalBoolean,
  pickArray,
} from "../lib/aggregatorUtils.js";
import { buildLoanOffersFromPools, sortLoanOffers } from "../lib/offers.js";

const router = Router();
const PROTOCOL = "vesu";
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

type Pagination = {
  page: number;
  limit: number;
};

type OfferSortBy = "netApy" | "maxLtv" | "liquidationPrice";
type OfferSortOrder = "asc" | "desc";
type OfferMode = "borrowToCollateral" | "collateralToBorrow";

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

function parsePositiveNumber(value: string, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${field} must be a positive number`);
  }
  return parsed;
}

router.get("/pools", async (req: Request, res: Response) => {
  try {
    const pagination = parsePagination(req);
    const onlyVerified = parseOptionalBoolean(req.query.onlyVerified);
    const onlyEnabledAssets = parseOptionalBoolean(req.query.onlyEnabledAssets);

    const raw = await getPools({ onlyVerified, onlyEnabledAssets });
    const pools = pickArray(raw, ["data", "pools"]).map(normalizePool);
    const filtered = pools.filter((pool) => pool.isDeprecated !== true);
    const tagged = filtered.map((pool) => ({
      protocol: PROTOCOL,
      data: pool,
    }));
    const paged = paginate(tagged, pagination);

    return res.json({
      data: paged.data,
      meta: paged.meta,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to fetch pools";
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
    const raw = await getPositions(walletAddress);
    const positions = pickArray(raw, ["data", "positions"]).map((entry) =>
      normalizePosition(entry, walletAddress)
    );
    const tagged = positions.map((position) => ({
      protocol: PROTOCOL,
      data: position,
    }));
    const paged = paginate(tagged, pagination);

    return res.json({
      data: paged.data,
      meta: paged.meta,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to fetch positions";
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
    const raw = await getUserHistory(address);
    const history = pickArray(raw, ["data", "history"]).map(normalizeHistoryEntry);
    const tagged = history.map((entry) => ({
      protocol: PROTOCOL,
      data: entry,
    }));
    const paged = paginate(tagged, pagination);

    return res.json({
      data: paged.data,
      meta: paged.meta,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to fetch user history";
    if (msg.includes("page must") || msg.includes("limit must")) {
      return res.status(400).json({ error: msg });
    }
    return res.status(502).json({ error: msg });
  }
});

router.get("/offers/loan", async (req: Request, res: Response) => {
  try {
    const pagination = parsePagination(req);
    const collateral = asString(req.query.collateral).trim();
    const borrow = asString(req.query.borrow).trim();
    if (!collateral || !borrow) {
      return res.status(400).json({ error: "collateral and borrow query parameters are required" });
    }

    const borrowUsdRaw = asString(req.query.borrowUsd).trim();
    const collateralAmountRaw = asString(req.query.collateralAmount).trim();
    const targetLtvRaw = asString(req.query.targetLtv).trim();
    const modeRaw = asString(req.query.mode).trim();
    const sortByRaw = asString(req.query.sortBy).trim();
    const sortOrderRaw = asString(req.query.sortOrder).trim();
    const mode: OfferMode = modeRaw ? (modeRaw as OfferMode) : "borrowToCollateral";
    if (!["borrowToCollateral", "collateralToBorrow"].includes(mode)) {
      return res.status(400).json({ error: "mode must be one of borrowToCollateral, collateralToBorrow" });
    }

    const borrowUsd = borrowUsdRaw ? parsePositiveNumber(borrowUsdRaw, "borrowUsd") : undefined;
    const collateralAmount = collateralAmountRaw
      ? parsePositiveNumber(collateralAmountRaw, "collateralAmount")
      : undefined;
    const targetLtv = targetLtvRaw ? parsePositiveNumber(targetLtvRaw, "targetLtv") : undefined;
    if (targetLtv !== undefined && targetLtv > 1) {
      return res.status(400).json({ error: "targetLtv must be between 0 and 1" });
    }
    if (mode === "collateralToBorrow" && collateralAmount === undefined) {
      return res.status(400).json({ error: "collateralAmount query parameter is required for collateralToBorrow mode" });
    }

    const sortBy: OfferSortBy = sortByRaw
      ? (sortByRaw as OfferSortBy)
      : "netApy";
    const sortOrder: OfferSortOrder = sortOrderRaw
      ? (sortOrderRaw as OfferSortOrder)
      : "desc";
    if (!["netApy", "maxLtv", "liquidationPrice"].includes(sortBy)) {
      return res.status(400).json({ error: "sortBy must be one of netApy, maxLtv, liquidationPrice" });
    }
    if (!["asc", "desc"].includes(sortOrder)) {
      return res.status(400).json({ error: "sortOrder must be one of asc, desc" });
    }

    const raw = await getPools({ onlyVerified: true, onlyEnabledAssets: true });
    const pools = pickArray(raw, ["data", "pools"]);
    const offers = buildLoanOffersFromPools(pools, {
      collateral,
      borrow,
      mode,
      borrowUsd,
      collateralAmount,
      targetLtv,
    });
    const sorted = sortLoanOffers(offers, sortBy, sortOrder);
    const tagged = sorted.map((offer) => ({ protocol: PROTOCOL, data: offer }));
    const paged = paginate(tagged, pagination);

    return res.json({
      data: paged.data,
      meta: paged.meta,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to fetch offers";
    if (
      msg.includes("page must") ||
      msg.includes("limit must") ||
      msg.includes("borrowUsd must") ||
      msg.includes("collateralAmount must") ||
      msg.includes("targetLtv must")
    ) {
      return res.status(400).json({ error: msg });
    }
    return res.status(502).json({ error: msg });
  }
});

export default router;
