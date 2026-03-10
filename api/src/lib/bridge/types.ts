export type BridgeNetwork = "mainnet" | "testnet";

export type BridgeOrderStatus =
  | "CREATED"
  | "SWAP_CREATED"
  | "BTC_SENT"
  | "BTC_CONFIRMED"
  | "CLAIMING"
  | "SETTLED"
  | "FAILED"
  | "EXPIRED"
  | "REFUNDED";

export type BridgeAmountType = "exactIn" | "exactOut";

export type BridgeOrderAction = "swap" | "borrow" | "stake";

export type BridgeCreateOrderInput = {
  network: BridgeNetwork;
  sourceAsset: "BTC";
  destinationAsset: string;
  amount: string;
  amountType: BridgeAmountType;
  receiveAddress: string;
  walletAddress: string;
  bitcoinAddress: string | null;
  action: BridgeOrderAction;
};

export type BridgeOrder = {
  id: string;
  network: BridgeNetwork;
  sourceAsset: "BTC";
  destinationAsset: string;
  amount: string;
  amountType: BridgeAmountType;
  amountSource: string | null;
  amountDestination: string | null;
  depositAddress: string | null;
  receiveAddress: string;
  walletAddress: string;
  bitcoinAddress: string | null;
  status: BridgeOrderStatus;
  action: BridgeOrderAction;
  atomiqSwapId: string | null;
  sourceTxId: string | null;
  destinationTxId: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BridgeOrderPage = {
  data: BridgeOrder[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
};
