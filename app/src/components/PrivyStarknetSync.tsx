import { useEffect } from "react";
import { usePrivyStarknet } from "@/hooks/usePrivyStarknet";
import { useWallet } from "@/store/useWallet";

/**
 * Syncs Privy+Starkzap wallet state to the global wallet store.
 * When user is authenticated with Privy and wallet is ready, we call connectPrivyStarknet
 * and set the starkzap wallet for Earn page (balance + stake).
 */
export function PrivyStarknetSync() {
  const { wallet, walletAddress, starknetSigner, isReady, isAuthenticated } =
    usePrivyStarknet();
  const { connectPrivyStarknet, disconnectPrivyStarknet, setPrivyStarkzapWallet, starknetSource } =
    useWallet();

  useEffect(() => {
    if (isReady && walletAddress && starknetSigner) {
      connectPrivyStarknet(walletAddress, starknetSigner);
    }
  }, [isReady, walletAddress, starknetSigner, connectPrivyStarknet]);

  useEffect(() => {
    if (isReady && wallet) {
      setPrivyStarkzapWallet(wallet);
    }
  }, [isReady, wallet, setPrivyStarkzapWallet]);

  useEffect(() => {
    if (!isAuthenticated && starknetSource === "privy") {
      setPrivyStarkzapWallet(null);
      disconnectPrivyStarknet();
    }
  }, [isAuthenticated, starknetSource, disconnectPrivyStarknet, setPrivyStarkzapWallet]);

  return null;
}
