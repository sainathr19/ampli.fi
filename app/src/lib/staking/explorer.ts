import { STARKNET_NETWORK } from "@/lib/staking/starkzapClient";

const EXPLORER_BASE_URL =
  STARKNET_NETWORK === "mainnet"
    ? "https://voyager.online"
    : "https://sepolia.voyager.online";

export function getAddressExplorerUrl(address: string): string {
  return `${EXPLORER_BASE_URL}/contract/${address}`;
}

export function getTxExplorerUrl(txHash: string): string {
  return `${EXPLORER_BASE_URL}/tx/${txHash}`;
}
