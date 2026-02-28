/**
 * Starkzap + Privy + App Configuration
 */

export const NETWORK = (import.meta.env.VITE_NETWORK || "sepolia") as
  | "mainnet"
  | "sepolia";

export const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:3000").replace(
  /\/+$/,
  ""
);

export const RPC_URL =
  import.meta.env.VITE_RPC_URL ||
  "https://starknet-sepolia.public.blastapi.io/rpc/v0_8";

export const STORAGE_KEYS = {
  userId: "amplifi_privy_user_id",
  walletId: "amplifi_wallet_id",
  walletAddress: "amplifi_wallet_address",
  publicKey: "amplifi_public_key",
} as const;
