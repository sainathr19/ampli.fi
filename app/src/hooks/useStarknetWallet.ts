"use client";

import {
  useConnect,
  useAccount,
  useDisconnect,
  useSwitchChain,
} from "@starknet-react/core";
import { connectors } from "@/layout/starknet/config";
import { NETWORK } from "@/lib/constants";

/** Starknet wallet connect via @starknet-react/core connectors (no modal). */
export function useStarknetWallet() {
  const { connect, connectAsync } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const { address, status, account, connector, chainId } = useAccount();

  const targetChainId =
    NETWORK === "mainnet"
      ? "0x534e5f4d41494e" // SN_MAIN
      : "0x534e5f5345504f4c4941"; // SN_SEPOLIA

  const { switchChainAsync } = useSwitchChain({
    params: { chainId: targetChainId },
  });

  return {
    starknetConnect: connect,
    starknetConnectAsync: connectAsync,
    starknetConnectors: connectors,
    starknetConnector: connector,
    starknetDisconnect: disconnectAsync,
    starknetAddress: address,
    starknetStatus: status,
    starknetAccount: account,
    starknetChainId: chainId,
    starknetSwitchChain: switchChainAsync,
    targetChainId: BigInt(targetChainId),
  };
}
