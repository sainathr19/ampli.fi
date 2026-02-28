import { BitcoinNetwork, SwapAmountType, SwapperFactory } from "@atomiqlabs/sdk";
import { StarknetInitializer } from "@atomiqlabs/chain-starknet";
import { BridgeAmountType, BridgeNetwork, BridgeOrder, BridgePrepareResult, BridgeSubmitInput } from "./types.js";

type AtomiqSwapLike = {
  getId?: () => string;
  getState?: () => unknown;
  getAddress?: () => string;
  getTimeoutTime?: () => number;
  getInput?: () => unknown;
  getOutput?: () => unknown;
  getInputTxId?: () => string | null;
  getOutputTxId?: () => string | null;
  txsExecute?: (options?: Record<string, unknown>) => Promise<unknown>;
  submitPsbt?: (psbt: string) => Promise<string>;
  claim?: (...args: unknown[]) => Promise<string>;
  refund?: (...args: unknown[]) => Promise<string>;
  isClaimable?: () => boolean;
  isRefundable?: () => boolean;
};

type CreateIncomingSwapInput = {
  network: BridgeNetwork;
  destinationAsset: string;
  amount: string;
  amountType: BridgeAmountType;
  receiveAddress: string;
};

type CreateIncomingSwapResult = {
  atomiqSwapId: string;
  statusRaw: unknown;
  quote: Record<string, unknown>;
  expiresAt: string | null;
};

type AtomiqOrderSnapshot = {
  statusRaw: unknown;
  sourceTxId: string | null;
  destinationTxId: string | null;
  rawState: Record<string, unknown>;
  isClaimable: boolean;
  isRefundable: boolean;
};

function getAmountLike(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const amount = obj.amount ?? obj.rawAmount ?? obj.value;
  return amount == null ? null : String(amount);
}

function parsePrepareResult(raw: unknown): BridgePrepareResult {
  const steps = Array.isArray(raw) ? raw : [];
  for (const step of steps) {
    if (!step || typeof step !== "object") continue;
    const entry = step as Record<string, unknown>;
    if (entry.name !== "Payment") continue;
    const txs = Array.isArray(entry.txs) ? entry.txs : [];
    for (const tx of txs) {
      if (!tx || typeof tx !== "object") continue;
      const item = tx as Record<string, unknown>;
      if (item.type === "FUNDED_PSBT") {
        return {
          type: "SIGN_PSBT",
          psbtBase64: typeof item.psbtBase64 === "string" ? item.psbtBase64 : undefined,
          signInputs: Array.isArray(item.signInputs)
            ? item.signInputs.filter((v): v is number => typeof v === "number")
            : undefined,
          raw: item,
        };
      }
      if (item.type === "ADDRESS") {
        return {
          type: "ADDRESS",
          depositAddress: typeof item.address === "string" ? item.address : undefined,
          amountSats: item.amount == null ? undefined : String(item.amount),
          raw: item,
        };
      }
    }
  }
  return { type: "ADDRESS", raw };
}

export interface AtomiqClient {
  createIncomingSwap(input: CreateIncomingSwapInput): Promise<CreateIncomingSwapResult>;
  prepareIncomingSwap(order: BridgeOrder): Promise<BridgePrepareResult>;
  submitIncomingSwap(order: BridgeOrder, input: BridgeSubmitInput): Promise<{ sourceTxId: string | null }>;
  getOrderSnapshot(order: BridgeOrder): Promise<AtomiqOrderSnapshot>;
  tryClaim(order: BridgeOrder): Promise<{ success: boolean; txId?: string }>;
  tryRefund(order: BridgeOrder): Promise<{ success: boolean; txId?: string }>;
}

export class AtomiqSdkClient implements AtomiqClient {
  private readonly factory = new SwapperFactory([StarknetInitializer]);
  private readonly swappers = new Map<BridgeNetwork, Promise<any>>();

  private async getSwapper(network: BridgeNetwork): Promise<any> {
    const existing = this.swappers.get(network);
    if (existing) {
      return existing;
    }

    const rpcUrl =
      network === "mainnet"
        ? process.env.ATOMIQ_STARKNET_RPC_MAINNET
        : process.env.ATOMIQ_STARKNET_RPC_TESTNET;
    if (!rpcUrl) {
      throw new Error(`Missing Starknet RPC URL for ${network}`);
    }

    const chainId = network === "mainnet" ? process.env.ATOMIQ_STARKNET_CHAIN_ID_MAINNET : process.env.ATOMIQ_STARKNET_CHAIN_ID_TESTNET;
    const networkValue = network === "mainnet" ? BitcoinNetwork.MAINNET : BitcoinNetwork.TESTNET;

    const swapperPromise = this.factory.newSwapperInitialized({
      chains: {
        STARKNET: {
          rpcUrl,
          chainId: chainId as never,
        },
      },
      bitcoinNetwork: networkValue,
      noEvents: true,
      noTimers: true,
      dontCheckPastSwaps: true,
      saveUninitializedSwaps: true,
    });

    this.swappers.set(network, swapperPromise);
    return swapperPromise;
  }

  private async getSwap(order: BridgeOrder): Promise<AtomiqSwapLike> {
    const swapper = await this.getSwapper(order.network);
    if (!order.atomiqSwapId) {
      throw new Error("Missing atomiqSwapId for bridge order");
    }
    const swap = await swapper.getSwapById(order.atomiqSwapId);
    if (!swap) {
      throw new Error("Atomiq swap not found");
    }
    return swap as AtomiqSwapLike;
  }

  async createIncomingSwap(input: CreateIncomingSwapInput): Promise<CreateIncomingSwapResult> {
    const swapper = await this.getSwapper(input.network);
    const amountType = input.amountType === "exactOut" ? SwapAmountType.EXACT_OUT : SwapAmountType.EXACT_IN;
    const token = (this.factory as any).TokenResolver.STARKNET.getToken(input.destinationAsset);
    const swap = (await swapper.swap(
      "BTC",
      token,
      input.amount,
      amountType,
      undefined,
      input.receiveAddress
    )) as AtomiqSwapLike;

    const atomiqSwapId = swap.getId ? swap.getId() : "";
    if (!atomiqSwapId) {
      throw new Error("Unable to create Atomiq swap id");
    }

    const quote: Record<string, unknown> = {
      amountIn: getAmountLike(swap.getInput?.()),
      amountOut: getAmountLike(swap.getOutput?.()),
      depositAddress: swap.getAddress?.() ?? null,
    };

    const timeout = swap.getTimeoutTime?.();
    return {
      atomiqSwapId,
      statusRaw: swap.getState?.(),
      quote,
      expiresAt: typeof timeout === "number" ? new Date(timeout).toISOString() : null,
    };
  }

  async prepareIncomingSwap(order: BridgeOrder): Promise<BridgePrepareResult> {
    const swap = await this.getSwap(order);
    if (!swap.txsExecute) {
      return {
        type: "ADDRESS",
        depositAddress: swap.getAddress?.(),
      };
    }

    const raw = await swap.txsExecute();
    return parsePrepareResult(raw);
  }

  async submitIncomingSwap(order: BridgeOrder, input: BridgeSubmitInput): Promise<{ sourceTxId: string | null }> {
    const swap = await this.getSwap(order);
    if (input.signedPsbtBase64 && swap.submitPsbt) {
      const txId = await swap.submitPsbt(input.signedPsbtBase64);
      return { sourceTxId: txId };
    }
    if (input.sourceTxId) {
      return { sourceTxId: input.sourceTxId };
    }
    throw new Error("Either signedPsbtBase64 or sourceTxId must be provided");
  }

  async getOrderSnapshot(order: BridgeOrder): Promise<AtomiqOrderSnapshot> {
    const swap = await this.getSwap(order);
    const statusRaw = swap.getState?.();
    return {
      statusRaw,
      sourceTxId: swap.getInputTxId?.() ?? null,
      destinationTxId: swap.getOutputTxId?.() ?? null,
      rawState: {
        state: statusRaw == null ? null : String(statusRaw),
      },
      isClaimable: swap.isClaimable?.() ?? false,
      isRefundable: swap.isRefundable?.() ?? false,
    };
  }

  async tryClaim(order: BridgeOrder): Promise<{ success: boolean; txId?: string }> {
    const swap = await this.getSwap(order);
    if (!swap.isClaimable?.() || !swap.claim) {
      return { success: false };
    }
    const txId = await swap.claim();
    return { success: true, txId };
  }

  async tryRefund(order: BridgeOrder): Promise<{ success: boolean; txId?: string }> {
    const swap = await this.getSwap(order);
    if (!swap.isRefundable?.() || !swap.refund) {
      return { success: false };
    }
    const txId = await swap.refund();
    return { success: true, txId };
  }
}
