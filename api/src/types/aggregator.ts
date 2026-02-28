export type PoolAsset = {
  symbol: string;
  address: string;
  decimals?: number;
};

export type PoolPair = {
  collateralAsset: string;
  debtAsset: string;
};

export type Pool = {
  id: string;
  name: string;
  protocolVersion: string;
  isDeprecated: boolean;
  assets: PoolAsset[];
  pairs: PoolPair[];
};

export type Position = {
  id: string;
  pool: string;
  type: string;
  collateral: string;
  collateralShares: string;
  walletAddress: string;
};

export type UserHistoryEntry = {
  pool: string;
  txHash: string;
  timestamp: number;
  collateral: string;
  type: string;
};

export type LoanQuote = {
  mode: "borrowToCollateral" | "collateralToBorrow";
  borrowUsd: number | null;
  collateralAmount: number | null;
  collateralUsd: number | null;
  maxBorrowUsd: number | null;
  maxBorrowAmount: number | null;
  targetLtv: number | null;
  requiredCollateralUsd: number | null;
  requiredCollateralAmount: number | null;
  liquidationPrice: number | null;
};

export type LoanOffer = {
  offerId: string;
  pool: {
    id: string;
    name: string;
  };
  collateral: {
    symbol: string;
    address: string;
    decimals: number | null;
  };
  borrow: {
    symbol: string;
    address: string;
    decimals: number | null;
  };
  chain: "starknet";
  maxLtv: number;
  liquidationFactor: number;
  borrowApr: number;
  collateralApr: number;
  netApy: number;
  quote: LoanQuote;
};
