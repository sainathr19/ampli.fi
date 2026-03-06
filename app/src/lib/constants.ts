/**
 * Starkzap + Privy + App Configuration
 */

export const NETWORK = (import.meta.env.VITE_NETWORK || "sepolia") as
  | "mainnet"
  | "sepolia";

export const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:6969").replace(
  /\/+$/,
  ""
);

export const RPC_URL =
  import.meta.env.VITE_RPC_URL ||
  "https://starknet-sepolia.public.blastapi.io/rpc/v0_8";

/** Mempool.space API base for BTC address/balance (testnet4 matches wallet). */
export const MEMPOOL_API_BASE =
  import.meta.env.VITE_BITCOIN_NETWORK === "mainnet"
    ? "https://mempool.space/api"
    : "https://mempool.space/testnet4/api";

export const STORAGE_KEYS = {
  userId: "amplifi_privy_user_id",
  walletId: "amplifi_wallet_id",
  walletAddress: "amplifi_wallet_address",
  publicKey: "amplifi_public_key",
} as const;

export const LOGOS = {
  brand: "/logos/brand.svg",
  wallet: "/logos/wallet.svg",
  import: "/logos/import.svg",
  swap: "/logos/swap.svg",
  export: "/logos/export.svg",
  borrow: "/logos/borrow.svg",
  next: "/logos/next.svg",
  back: "/logos/back.svg",
  dropdown: "/logos/dropdown.svg",
  ltv: "/logos/ltv.svg",
  protocol: "/logos/protocol.svg",
  status: "/logos/status.svg",
  loading: "/logos/loading.svg",
  info: "/logos/info.svg",
} as const;

export const ASSET_ICONS = {
  BTC: "https://s2.coinmarketcap.com/static/img/coins/64x64/1.png",
  WBTC: "https://s2.coinmarketcap.com/static/img/coins/64x64/3717.png",
  ETH: "https://s2.coinmarketcap.com/static/img/coins/64x64/1027.png",
  USDC: "https://s2.coinmarketcap.com/static/img/coins/64x64/3408.png",
  STRK: "https://starknet.io/favicon.ico",
} as const;

export const POOL_ICONS = {
  re7: "",
  clearstar: "https://vesu.xyz/img/curator-logos/clearstar-light.png"
} as const;

/** Protocol icons for borrow offers (vesu, uncap, etc.). Keys are lowercase protocol id. */
export const PROTOCOL_ICONS: Record<string, string> = {
  vesu: "/logos/vesu.png",
  uncap: "/logos/uncap.png",
};

export function getProtocolIconUrl(protocol: string): string {
  const key = protocol?.toLowerCase?.() ?? "";
  return PROTOCOL_ICONS[key] ?? LOGOS.protocol;
}

const ASSET_ICON_DEFAULT = "https://placehold.co/24x24/8b5cf6/ffffff?text=A";

export function getAssetIconUrl(symbol: string): string {
  const s = symbol.toUpperCase();
  if (s in ASSET_ICONS) return ASSET_ICONS[s as keyof typeof ASSET_ICONS];
  return `${ASSET_ICON_DEFAULT}${s[0] ?? "?"}`;
}

export const POOL_ICON_PLACEHOLDER = "https://placehold.co/40x40/033122/ffffff?text=P";
