import type { EarnHistoryEntry, EarnPool, EarnPosition } from "../../types/earn.js";
import { createNativeStakingAdapter } from "./starknetStaking.js";

export type EarnProtocolAdapter = {
  protocol: string;
  getPools?(validator?: string): Promise<EarnPool[]>;
  getPositions(userAddress: string): Promise<EarnPosition[]>;
  getHistory?(userAddress: string, opts?: { type?: string }): Promise<EarnHistoryEntry[]>;
};

export function getEnabledEarnProtocols(): string[] {
  return ["native_staking"];
}

export function getEarnProtocolAdapters(): EarnProtocolAdapter[] {
  return [createNativeStakingAdapter()];
}
