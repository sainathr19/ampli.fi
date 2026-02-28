/**
 * Token amount utilities. All amounts use string representation to avoid
 * decimal precision errors. Never use float for token amounts.
 *
 * Base units = what we use everywhere (API input, DB): e.g. "10000000" for 0.1 BTC
 * Decimal string = only for Atomiq SDK: e.g. "0.1" (1 BTC = 100_000_000 base units)
 */

const SOURCE_DECIMALS = 8; // BTC
const DESTINATION_DECIMALS: Record<string, number> = {
  WBTC: 8,
  TBTC: 18,
  ETH: 18,
  STRK: 18,
  USDC: 6,
  USDT: 6,
  _TESTNET_WBTC_VESU: 8,
};

export function getSourceDecimals(): number {
  return SOURCE_DECIMALS;
}

export function getDestinationDecimals(asset: string): number {
  return DESTINATION_DECIMALS[asset] ?? 8;
}

/**
 * Convert token amount (decimal string) to base units (BigInt).
 * Uses string manipulation only - no float.
 * Examples: "0.001" with 8 decimals → 100000n, "100" with 6 decimals → 100000000n
 */
export function tokenAmountToBaseUnits(amount: string, decimals: number): bigint {
  const trimmed = amount.trim();
  if (!trimmed || /[^\d.]/.test(trimmed) || trimmed.startsWith(".") || trimmed.endsWith(".")) {
    throw new Error(`Invalid token amount: ${amount}`);
  }
  if (trimmed.includes(".")) {
    const [before, after] = trimmed.split(".");
    const intPart = before === "0" || before === "" ? "" : before;
    if (after.length > decimals) {
      return BigInt(intPart + after.substring(0, decimals));
    }
    return BigInt(intPart + after.padEnd(decimals, "0"));
  }
  return BigInt(trimmed + "0".repeat(decimals));
}

/**
 * Convert base units (BigInt) to token amount (decimal string).
 * Examples: 100000n with 8 decimals → "0.001", 100000000n with 6 decimals → "100"
 */
export function baseUnitsToTokenAmount(baseUnits: bigint, decimals: number): string {
  if (decimals <= 0) {
    return (baseUnits * 10n ** BigInt(-decimals)).toString(10);
  }
  const str = baseUnits.toString(10).padStart(decimals + 1, "0");
  const splitPoint = str.length - decimals;
  const intPart = str.substring(0, splitPoint).replace(/^0+/, "") || "0";
  let decPart = str.substring(splitPoint).replace(/0+$/, "");
  if (!decPart) decPart = "0";
  return decPart === "0" ? intPart : `${intPart}.${decPart}`;
}

