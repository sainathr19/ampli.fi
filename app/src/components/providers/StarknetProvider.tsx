"use client";

import { StarknetConfig } from "@starknet-react/core";
import {
  starknetChains,
  starknetProviders,
  connectors,
  defaultChainId,
} from "@/layout/starknet/config";
import type { ReactNode } from "react";

interface StarknetProviderProps {
  children: ReactNode;
}

export function StarknetProvider({ children }: StarknetProviderProps) {
  return (
    <StarknetConfig
      chains={starknetChains}
      provider={starknetProviders}
      connectors={connectors}
      defaultChainId={defaultChainId}
      autoConnect
    >
      {children}
    </StarknetConfig>
  );
}
