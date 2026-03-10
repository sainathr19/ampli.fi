import { useMemo, useEffect } from "react";
import { ChainDataContext } from "./ChainDataContext";
import { useWallet } from "@/store/useWallet";

export function ChainDataProvider({ children }: { children: React.ReactNode }) {
  const { starknetAccount, starknetWalletName, connectStarknet, starknetAddress, tryRestoreStarknetAccount } = useWallet();

  useEffect(() => {
    if (starknetAddress && !starknetAccount) {
      tryRestoreStarknetAccount();
    }
  }, [starknetAddress, starknetAccount, tryRestoreStarknetAccount]);

  const contextValue = useMemo(() => {
    return {
      STARKNET: starknetAccount
        ? {
            chain: {
              name: "Starknet",
              icon: "/logos/protocol.svg",
            },
            wallet: {
              name: starknetWalletName || "Starknet Wallet",
              icon: "/logos/wallet.svg",
              address: starknetAccount.address,
              instance: starknetAccount,
            },
            id: "STARKNET",
            connect: connectStarknet,
          }
        : undefined,
    };
  }, [starknetAccount, starknetWalletName, connectStarknet]);

  return (
    <ChainDataContext.Provider value={contextValue}>
      {children}
    </ChainDataContext.Provider>
  );
}
