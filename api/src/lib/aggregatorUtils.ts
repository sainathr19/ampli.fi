import type { Pool, PoolAsset, PoolPair, Position, UserHistoryEntry } from "../types/aggregator.js";

export function pickArray(payload: unknown, preferredKeys: string[]): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((value): value is Record<string, unknown> => !!value && typeof value === "object");
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  for (const key of preferredKeys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.filter(
        (entry): entry is Record<string, unknown> => !!entry && typeof entry === "object"
      );
    }
  }

  return [];
}

export function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

export function asOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value !== "string") return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export function normalizeAsset(asset: Record<string, unknown>): PoolAsset {
  return {
    symbol: asString(asset.symbol, asString(asset.name, "UNKNOWN")),
    address: asString(asset.address, asString(asset.tokenAddress, "")),
    decimals: asOptionalNumber(asset.decimals),
  };
}

export function normalizePair(pair: Record<string, unknown>): PoolPair {
  return {
    collateralAsset: asString(
      pair.collateralAsset,
      asString(pair.collateral, asString(pair.assetA, ""))
    ),
    debtAsset: asString(pair.debtAsset, asString(pair.debt, asString(pair.assetB, ""))),
  };
}

export function normalizePool(raw: Record<string, unknown>): Pool {
  const assets = pickArray(raw.assets, ["assets"]).map(normalizeAsset);
  const pairs = pickArray(raw.pairs, ["pairs"]).map(normalizePair);
  const id = asString(raw.id, asString(raw.pool, asString(raw.poolId, asString(raw.address, ""))));

  return {
    id,
    name: asString(raw.name, id),
    protocolVersion: asString(raw.protocolVersion, asString(raw.version, "vesu")),
    isDeprecated: asBoolean(raw.isDeprecated, asBoolean(raw.deprecated, false)),
    assets,
    pairs,
  };
}

export function normalizePosition(raw: Record<string, unknown>, walletAddress: string): Position {
  const id = asString(raw.id, asString(raw.positionId, asString(raw.pool, "")));
  return {
    id,
    pool: asString(raw.pool, asString(raw.poolId, "")),
    type: asString(raw.type, asString(raw.side, "")),
    collateral: asString(raw.collateral, asString(raw.amount, "0")),
    collateralShares: asString(raw.collateralShares, asString(raw.shares, "0")),
    walletAddress,
  };
}

export function normalizeHistoryEntry(raw: Record<string, unknown>): UserHistoryEntry {
  return {
    pool: asString(raw.pool, asString(raw.poolId, "")),
    txHash: asString(raw.txHash, asString(raw.transactionHash, "")),
    timestamp: asNumber(raw.timestamp, asNumber(raw.time, 0)),
    collateral: asString(raw.collateral, asString(raw.amount, "0")),
    type: asString(raw.type, asString(raw.action, "")),
  };
}
