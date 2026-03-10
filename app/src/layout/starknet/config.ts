import { braavos, injected, ready } from "@starknet-react/core";
import { mainnet, sepolia } from "@starknet-react/chains";
import { RpcProvider } from "starknet";
import { NETWORK, RPC_URL } from "@/lib/constants";

export const starknetChains = [mainnet, sepolia];

export const connectors = [
  ready(),
  braavos(),
  injected({ id: "xverse", name: "Xverse" }),
];

const createStarknetProvider = () => {
  return () => {
    const rpcUrl =
      RPC_URL ??
      (NETWORK === "mainnet"
        ? "https://starknet-mainnet.public.blastapi.io/rpc/v0_8"
        : "https://starknet-sepolia.public.blastapi.io");
    return new RpcProvider({ nodeUrl: rpcUrl });
  };
};

export const starknetProviders = createStarknetProvider();

export const defaultChainId =
  NETWORK === "mainnet" ? mainnet.id : sepolia.id;
