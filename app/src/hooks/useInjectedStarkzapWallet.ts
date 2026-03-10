import { useCallback, useContext } from "react";
import { ChainDataContext } from "@/context/ChainDataContext";
import { InjectedStarkzapWallet } from "@/lib/staking/InjectedStarkzapWallet";

export function useInjectedStarkzapWallet() {
  const chainData = useContext(ChainDataContext);
  const account = chainData.STARKNET?.wallet?.instance;

  return useCallback(async () => {
    if (!account) {
      throw new Error("Connect your Starknet wallet to continue");
    }
    return InjectedStarkzapWallet.fromAccount(account as never);
  }, [account]);
}
