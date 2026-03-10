import { useCallback, useContext } from "react";
import type { WalletInterface } from "starkzap";
import { ChainDataContext } from "@/context/ChainDataContext";
import { InjectedStarkzapWallet } from "@/lib/staking/InjectedStarkzapWallet";
import { useWallet } from "@/store/useWallet";

/**
 * Returns a getter for the current Starkzap wallet used for Earn (balance + stake).
 * Works for both extension (ArgentX/Braavos) and Privy-connected wallets.
 */
export function useStarkzapWallet() {
  const chainData = useContext(ChainDataContext);
  const extensionAccount = chainData.STARKNET?.wallet?.instance;
  const { starknetSource, privyStarkzapWallet } = useWallet();

  return useCallback(async (): Promise<WalletInterface> => {
    if (starknetSource === "privy" && privyStarkzapWallet != null) {
      return privyStarkzapWallet as unknown as WalletInterface;
    }
    if (extensionAccount) {
      return InjectedStarkzapWallet.fromAccount(extensionAccount as never);
    }
    throw new Error("Connect your Starknet wallet to continue");
  }, [starknetSource, privyStarkzapWallet, extensionAccount]);
}
