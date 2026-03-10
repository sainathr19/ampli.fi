import type { Pool, Token } from "starkzap";

const BTC_LIKE_SYMBOLS = new Set([
  "BTC",
  "WBTC",
  "LBTC",
  "SOLVBTC",
  "TBTC",
  "TBTC1",
  "TBTC2",
  "XBTC",
  "XBTC1",
  "XBTC2",
]);

function normalizeSymbol(symbol: string | null | undefined): string {
  return (symbol || "").trim().toUpperCase();
}

export function isBtcLikeSymbol(symbol: string | null | undefined): boolean {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) return false;
  if (BTC_LIKE_SYMBOLS.has(normalized)) return true;
  return normalized.includes("BTC");
}

export function isBtcLikeToken(token: Pick<Token, "symbol"> | null): boolean {
  if (!token) return false;
  return isBtcLikeSymbol(token.symbol);
}

export function isBtcLikePool(pool: Pick<Pool, "token"> | null): boolean {
  if (!pool) return false;
  return isBtcLikeToken(pool.token);
}

export function pickPreferredStakeToken(tokens: Token[]): Token | undefined {
  if (tokens.length === 0) return undefined;
  const stark = tokens.find((token) => {
    const symbol = normalizeSymbol(token.symbol);
    return symbol === "STRK" || symbol === "STARK";
  });
  if (stark) return stark;
  const firstBtcLike = tokens.find(isBtcLikeToken);
  return firstBtcLike ?? tokens[0];
}
