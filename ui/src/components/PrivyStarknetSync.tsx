import { useEffect } from "react";
import { usePrivyStarknet } from "@/hooks/usePrivyStarknet";
import { useWallet } from "@/store/useWallet";

/**
 * Syncs Privy+Starkzap wallet state to the global wallet store.
 * When user is authenticated with Privy and wallet is ready, we call connectPrivyStarknet.
 */
export function PrivyStarknetSync() {
  const { walletAddress, starknetSigner, isReady, isAuthenticated } =
    usePrivyStarknet();
  const { connectPrivyStarknet, disconnectPrivyStarknet, starknetSource } =
    useWallet();

  useEffect(() => {
    if (isReady && walletAddress && starknetSigner) {
      connectPrivyStarknet(walletAddress, starknetSigner);
    }
  }, [isReady, walletAddress, starknetSigner, connectPrivyStarknet]);

  useEffect(() => {
    if (!isAuthenticated && starknetSource === "privy") {
      disconnectPrivyStarknet();
    }
  }, [isAuthenticated, starknetSource, disconnectPrivyStarknet]);

  return null;
}
