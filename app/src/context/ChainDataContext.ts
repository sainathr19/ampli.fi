import { createContext } from "react";
import type { WalletAccount } from "starknet";

export type ChainWalletData<T> = {
  chain: {
    name: string;
    icon: string;
  };
  wallet: {
    name: string;
    icon: string;
    address?: string;
    instance: T;
  } | null;
  id: string;
  disconnect?: () => Promise<void> | void;
  connect?: () => Promise<void> | void;
};

export type ChainIdentifiers = "STARKNET";

export const ChainDataContext = createContext<{
  STARKNET?: ChainWalletData<WalletAccount>;
}>({});
