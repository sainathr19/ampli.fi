import type { DstToken } from "@/lib/atomiq/swapService";
import { ASSET_ICONS } from "@/lib/constants";

// Atomiq supports BTC → ETH/STRK/WBTC. Source is always BTC.
export const SWAP_SOURCE_ASSET = {
  symbol: "BTC",
  icon: ASSET_ICONS.BTC,
  decimals: 8,
} as const;

export const SWAP_DESTINATION_ASSETS: {
  symbol: DstToken;
  icon: string;
  decimals: number;
  label: string;
}[] = [
  { symbol: "ETH", icon: ASSET_ICONS.ETH, decimals: 18, label: "ETH" },
  { symbol: "STRK", icon: ASSET_ICONS.STRK, decimals: 18, label: "STRK" },
  { symbol: "WBTC", icon: ASSET_ICONS.WBTC, decimals: 8, label: "WBTC" },
];

export function getSwapAssetIcon(symbol: string): string {
  const s = symbol.toUpperCase();
  if (s === "BTC") return ASSET_ICONS.BTC;
  if (s === "ETH") return ASSET_ICONS.ETH;
  if (s === "STRK") return ASSET_ICONS.STRK;
  if (s === "WBTC") return ASSET_ICONS.WBTC;
  return ASSET_ICONS.ETH;
}
