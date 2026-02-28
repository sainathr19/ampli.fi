export type BridgeNetwork = "mainnet" | "testnet";

export type BridgeOrderStatus =
  | "CREATED"
  | "AWAITING_USER_SIGNATURE"
  | "SOURCE_SUBMITTED"
  | "SOURCE_CONFIRMED"
  | "SETTLED"
  | "CLAIMING"
  | "REFUNDING"
  | "REFUNDED"
  | "FAILED"
  | "EXPIRED";

export type BridgeAmountType = "exactIn" | "exactOut";

export type BridgeActionType =
  | "CREATE_ORDER"
  | "PREPARE_ORDER"
  | "SUBMIT_ORDER"
  | "POLL_ORDER"
  | "AUTO_CLAIM"
  | "AUTO_REFUND"
  | "MANUAL_RETRY";

export type BridgeActionStatus = "SUCCESS" | "FAILED";

export type BridgeCreateOrderInput = {
  network: BridgeNetwork;
  sourceAsset: "BTC";
  destinationAsset: string;
  amount: string;
  amountType: BridgeAmountType;
  receiveAddress: string;
  walletAddress: string;
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
  status: BridgeOrderStatus;
  atomiqSwapId: string | null;
  sourceTxId: string | null;
  destinationTxId: string | null;
  quote: Record<string, unknown> | null;
  expiresAt: string | null;
  lastError: string | null;
  rawState: Record<string, unknown> | null;
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
