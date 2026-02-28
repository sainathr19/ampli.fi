export type EarnToken = {
  symbol: string;
  address: string;
  decimals: number | null;
};

export type EarnPool = {
  id: string;
  poolContract: string;
  validator: {
    name: string;
    stakerAddress: string;
  };
  token: EarnToken;
  delegatedAmount: string;
  commissionPercent: number | null;
};

export type EarnPosition = {
  poolContract: string;
  token: EarnToken;
  staked: string;
  rewards: string;
  total: string;
  unpooling: string;
  unpoolTime: string | null;
  commissionPercent: number;
  rewardAddress: string;
  walletAddress: string;
};

export type EarnHistoryType = "stake" | "add" | "claim" | "exit_intent" | "exit";

export type EarnHistoryEntry = {
  type: EarnHistoryType;
  poolContract: string;
  txHash: string;
  timestamp: number;
  amount: string | null;
  token: EarnToken | null;
  userAddress: string;
};

export type TaggedEarn<T> = {
  protocol: string;
  data: T;
};
