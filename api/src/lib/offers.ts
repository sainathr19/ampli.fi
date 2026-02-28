import type { LoanOffer, LoanQuote } from "../types/aggregator.js";
import { asNumber, asString, pickArray } from "./aggregatorUtils.js";

export type LoanOfferQuery = {
  collateral: string;
  borrow: string;
  mode: "borrowToCollateral" | "collateralToBorrow";
  borrowUsd?: number;
  collateralAmount?: number;
  targetLtv?: number;
};

export type LoanOfferSortBy = "netApy" | "maxLtv" | "liquidationPrice";
export type SortOrder = "asc" | "desc";

type VesuDecimal = {
  value: string;
  decimals: number;
};

function parseDecimalValue(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const raw = asString(record.value);
  const decimals = asNumber(record.decimals, NaN);
  if (!raw || !Number.isFinite(decimals)) return null;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return parsed / 10 ** decimals;
}

function normalizeTokenRef(asset: Record<string, unknown>) {
  return {
    symbol: asString(asset.symbol),
    address: asString(asset.address).toLowerCase(),
    decimals: Number.isFinite(asNumber(asset.decimals, NaN)) ? asNumber(asset.decimals, NaN) : null,
  };
}

function matchesAsset(query: string, asset: { symbol: string; address: string }): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.startsWith("0x")) {
    return asset.address === normalized;
  }
  return asset.symbol.toLowerCase() === normalized;
}

function getAprFromStats(stats: Record<string, unknown>, key: string): number {
  const candidate = parseDecimalValue(stats[key]);
  return candidate ?? 0;
}

function getCollateralApr(stats: Record<string, unknown>): number {
  const btcFiApr = parseDecimalValue(stats.btcFiSupplyApr);
  if (btcFiApr !== null) return btcFiApr;
  return getAprFromStats(stats, "supplyApy");
}

function getUsdPrice(asset: Record<string, unknown>): number | null {
  return parseDecimalValue(asset.usdPrice);
}

function buildQuote(
  mode: LoanOfferQuery["mode"],
  borrowUsdInput: number | undefined,
  collateralAmountInput: number | undefined,
  targetLtvInput: number | undefined,
  maxLtv: number,
  collateralPriceUsd: number | null,
  borrowPriceUsd: number | null,
  liquidationFactor: number
): LoanQuote {
  if (mode === "collateralToBorrow") {
    const collateralAmount = typeof collateralAmountInput === "number" ? collateralAmountInput : null;
    const effectiveLtv = typeof targetLtvInput === "number" ? targetLtvInput : maxLtv;
    const targetLtv = Number.isFinite(effectiveLtv) ? effectiveLtv : null;

    if (
      collateralAmount === null ||
      targetLtv === null ||
      collateralPriceUsd === null ||
      collateralPriceUsd <= 0 ||
      borrowPriceUsd === null ||
      borrowPriceUsd <= 0 ||
      liquidationFactor <= 0
    ) {
      return {
        mode,
        borrowUsd: null,
        collateralAmount,
        collateralUsd: null,
        maxBorrowUsd: null,
        maxBorrowAmount: null,
        targetLtv,
        requiredCollateralUsd: null,
        requiredCollateralAmount: null,
        liquidationPrice: null,
      };
    }

    const collateralUsd = collateralAmount * collateralPriceUsd;
    const maxBorrowUsd = collateralUsd * targetLtv;
    const maxBorrowAmount = maxBorrowUsd / borrowPriceUsd;
    const liquidationPrice = collateralPriceUsd * (targetLtv / liquidationFactor);

    return {
      mode,
      borrowUsd: null,
      collateralAmount,
      collateralUsd,
      maxBorrowUsd,
      maxBorrowAmount,
      targetLtv,
      requiredCollateralUsd: null,
      requiredCollateralAmount: null,
      liquidationPrice,
    };
  }

  const borrowUsd = typeof borrowUsdInput === "number" ? borrowUsdInput : null;
  const targetLtv = typeof targetLtvInput === "number" ? targetLtvInput : null;

  if (
    borrowUsd === null ||
    targetLtv === null ||
    collateralPriceUsd === null ||
    collateralPriceUsd <= 0 ||
    liquidationFactor <= 0
  ) {
    return {
      mode,
      borrowUsd,
      collateralAmount: null,
      collateralUsd: null,
      maxBorrowUsd: null,
      maxBorrowAmount: null,
      targetLtv,
      requiredCollateralUsd: null,
      requiredCollateralAmount: null,
      liquidationPrice: null,
    };
  }

  const requiredCollateralUsd = borrowUsd / targetLtv;
  const requiredCollateralAmount = requiredCollateralUsd / collateralPriceUsd;
  const liquidationPrice = collateralPriceUsd * (targetLtv / liquidationFactor);

  return {
    mode,
    borrowUsd,
    collateralAmount: null,
    collateralUsd: null,
    maxBorrowUsd: null,
    maxBorrowAmount: null,
    targetLtv,
    requiredCollateralUsd,
    requiredCollateralAmount,
    liquidationPrice,
  };
}

export function buildLoanOffersFromPools(
  pools: Record<string, unknown>[],
  query: LoanOfferQuery
): LoanOffer[] {
  const offers: LoanOffer[] = [];

  pools.forEach((pool) => {
    const isDeprecated = Boolean(pool.isDeprecated);
    if (isDeprecated) return;

    const poolId = asString(pool.id);
    const poolName = asString(pool.name, poolId);
    const assets = pickArray(pool.assets, ["assets"]);
    const pairs = pickArray(pool.pairs, ["pairs"]);

    const normalizedAssets = assets.map((asset) => {
      const normalized = normalizeTokenRef(asset);
      return { raw: asset, ...normalized };
    });

    pairs.forEach((pair) => {
      const collateralAddress = asString(pair.collateralAssetAddress).toLowerCase();
      const debtAddress = asString(pair.debtAssetAddress).toLowerCase();
      if (!collateralAddress || !debtAddress) return;

      const collateralAsset = normalizedAssets.find((asset) => asset.address === collateralAddress);
      const debtAsset = normalizedAssets.find((asset) => asset.address === debtAddress);
      if (!collateralAsset || !debtAsset) return;

      if (!matchesAsset(query.collateral, collateralAsset) || !matchesAsset(query.borrow, debtAsset)) {
        return;
      }

      const maxLtv = parseDecimalValue(pair.maxLTV as VesuDecimal) ?? 0;
      if (query.targetLtv !== undefined && query.targetLtv > maxLtv) {
        return;
      }

      const liquidationFactor = parseDecimalValue(pair.liquidationFactor as VesuDecimal) ?? 0;
      const collateralStats =
        collateralAsset.raw.stats && typeof collateralAsset.raw.stats === "object"
          ? (collateralAsset.raw.stats as Record<string, unknown>)
          : {};
      const debtStats =
        debtAsset.raw.stats && typeof debtAsset.raw.stats === "object"
          ? (debtAsset.raw.stats as Record<string, unknown>)
          : {};

      const collateralApr = getCollateralApr(collateralStats);
      const borrowApr = getAprFromStats(debtStats, "borrowApr");
      const netApy = collateralApr - borrowApr;
      const collateralPriceUsd = getUsdPrice(collateralAsset.raw);
      const borrowPriceUsd = getUsdPrice(debtAsset.raw);

      offers.push({
        offerId: `vesu:${poolId}:${collateralAsset.address}:${debtAsset.address}`,
        pool: { id: poolId, name: poolName },
        collateral: {
          symbol: collateralAsset.symbol,
          address: collateralAsset.address,
          decimals: collateralAsset.decimals,
        },
        borrow: {
          symbol: debtAsset.symbol,
          address: debtAsset.address,
          decimals: debtAsset.decimals,
        },
        chain: "starknet",
        maxLtv,
        liquidationFactor,
        borrowApr,
        collateralApr,
        netApy,
        quote: buildQuote(
          query.mode,
          query.borrowUsd,
          query.collateralAmount,
          query.targetLtv,
          maxLtv,
          collateralPriceUsd,
          borrowPriceUsd,
          liquidationFactor
        ),
      });
    });
  });

  return offers;
}

export function sortLoanOffers(
  offers: LoanOffer[],
  sortBy: LoanOfferSortBy,
  sortOrder: SortOrder
): LoanOffer[] {
  const direction = sortOrder === "asc" ? 1 : -1;
  const sorted = [...offers];

  sorted.sort((a, b) => {
    let left: number | null = null;
    let right: number | null = null;

    if (sortBy === "netApy") {
      left = a.netApy;
      right = b.netApy;
    } else if (sortBy === "maxLtv") {
      left = a.maxLtv;
      right = b.maxLtv;
    } else {
      left = a.quote.liquidationPrice;
      right = b.quote.liquidationPrice;
    }

    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    return (left - right) * direction;
  });

  return sorted;
}
