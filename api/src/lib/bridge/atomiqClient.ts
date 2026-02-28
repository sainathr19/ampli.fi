import { BitcoinNetwork, SwapAmountType, SwapperFactory } from "@atomiqlabs/sdk";
import { StarknetInitializer } from "@atomiqlabs/chain-starknet";
import { RpcProvider } from "starknet";
import { log } from "../logger.js";
import { BridgeAmountType, BridgeNetwork, BridgeOrder, BridgeSubmitInput } from "./types.js";
import { settings } from "../settings.js";
import { PostgresUnifiedStorage } from "./postgresStorage.js";
import { InMemoryChainStorage } from "./inMemoryStorage.js";
import {
  baseUnitsToTokenAmount,
  getSourceDecimals,
  getDestinationDecimals,
} from "./tokenAmounts.js";

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
  amountSource: string;
  amountDestination: string;
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

export interface AtomiqClient {
  createIncomingSwap(input: CreateIncomingSwapInput): Promise<CreateIncomingSwapResult>;
  submitIncomingSwap(order: BridgeOrder, input: BridgeSubmitInput): Promise<{ sourceTxId: string | null }>;
  getOrderSnapshot(order: BridgeOrder): Promise<AtomiqOrderSnapshot>;
  tryClaim(order: BridgeOrder): Promise<{ success: boolean; txId?: string }>;
  tryRefund(order: BridgeOrder): Promise<{ success: boolean; txId?: string }>;
}

export class AtomiqSdkClient implements AtomiqClient {
  private readonly factory = new SwapperFactory([StarknetInitializer]);
  private swapperPromise: Promise<any> | null = null;

  private async getSwapper(_network: BridgeNetwork): Promise<any> {
    if (this.swapperPromise) {
      return this.swapperPromise;
    }

    const bridgeRpcUrl = settings.bridge_rpc_url ?? settings.rpc_url;
    const provider = new RpcProvider({ nodeUrl: bridgeRpcUrl });
    const chainId = await provider.getChainId();
    const networkValue = settings.network === "mainnet" ? BitcoinNetwork.MAINNET : BitcoinNetwork.TESTNET;

    this.swapperPromise = this.factory.newSwapperInitialized({
      chains: {
        STARKNET: {
          rpcUrl: bridgeRpcUrl,
          chainId: chainId as never,
        },
      },
      bitcoinNetwork: networkValue,
      noEvents: true,
      noTimers: true,
      dontCheckPastSwaps: true,
      saveUninitializedSwaps: true,
      swapStorage: (name: string) => new PostgresUnifiedStorage(name),
      chainStorageCtor: ((name: string) => new InMemoryChainStorage(name)) as never,
    });

    return this.swapperPromise;
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
    log.info("atomiq createIncomingSwap start", {
      network: input.network,
      destinationAsset: input.destinationAsset,
      amount: input.amount,
      receiveAddress: input.receiveAddress,
    });
    const swapper = await this.getSwapper(input.network);
    const amountType = input.amountType === "exactOut" ? SwapAmountType.EXACT_OUT : SwapAmountType.EXACT_IN;
    const tokens = (this.factory as any).Tokens.STARKNET as Record<string, unknown>;
    const tokenResolver = (this.factory as any).TokenResolver.STARKNET;
    const ticker =
      input.network === "testnet" && input.destinationAsset === "WBTC"
        ? "_TESTNET_WBTC_VESU"
        : input.destinationAsset;
    const token = tokens[ticker] ?? tokenResolver.getToken(input.destinationAsset);
    if (!token) {
      throw new Error(`Unsupported destination asset: ${input.destinationAsset}`);
    }
    // Input and DB use base units (e.g. "10000000"). Only Atomiq SDK expects decimal string like "0.1".
    const srcDecimals = getSourceDecimals();
    const dstDecimals = getDestinationDecimals(ticker);
    const amountBaseUnits = BigInt(input.amount);
    const amountForSdk =
      amountType === SwapAmountType.EXACT_IN
        ? baseUnitsToTokenAmount(amountBaseUnits, srcDecimals)
        : baseUnitsToTokenAmount(amountBaseUnits, dstDecimals);

    const exactIn = amountType === SwapAmountType.EXACT_IN;
    const swap = (await swapper.swap(
      "BTC",
      token,
      amountForSdk,
      exactIn,
      undefined,
      input.receiveAddress
    )) as AtomiqSwapLike;

    const atomiqSwapId = swap.getId ? swap.getId() : "";
    if (!atomiqSwapId) {
      throw new Error("Unable to create Atomiq swap id");
    }

    const amountInBase = getAmountLike(swap.getInput?.());
    const amountOutBase = getAmountLike(swap.getOutput?.());
    const amountSource = amountInBase ?? input.amount;
    const amountDestination = amountOutBase ?? input.amount;

    const quote: Record<string, unknown> = {
      amountIn: amountSource,
      amountOut: amountDestination,
      depositAddress: swap.getAddress?.() ?? null,
    };

    const timeout = swap.getTimeoutTime?.();
    log.info("atomiq createIncomingSwap success", {
      atomiqSwapId,
      amountSource,
      amountDestination,
      depositAddress: swap.getAddress?.(),
    });
    return {
      atomiqSwapId,
      statusRaw: swap.getState?.(),
      quote,
      expiresAt: typeof timeout === "number" ? new Date(timeout).toISOString() : null,
      amountSource,
      amountDestination,
    };
  }

  async submitIncomingSwap(order: BridgeOrder, input: BridgeSubmitInput): Promise<{ sourceTxId: string | null }> {
    log.info("atomiq submitIncomingSwap start", {
      orderId: order.id,
      hasSignedPsbt: !!input.signedPsbtBase64,
      hasSourceTxId: !!input.sourceTxId,
    });
    const swap = await this.getSwap(order);
    if (input.signedPsbtBase64 && swap.submitPsbt) {
      const txId = await swap.submitPsbt(input.signedPsbtBase64);
      log.info("atomiq submitIncomingSwap success", { orderId: order.id, sourceTxId: txId });
      return { sourceTxId: txId };
    }
    if (input.sourceTxId) {
      log.info("atomiq submitIncomingSwap success", { orderId: order.id, sourceTxId: input.sourceTxId });
      return { sourceTxId: input.sourceTxId };
    }
    throw new Error("Either signedPsbtBase64 or sourceTxId must be provided");
  }

  async getOrderSnapshot(order: BridgeOrder): Promise<AtomiqOrderSnapshot> {
    log.info("atomiq getOrderSnapshot", { orderId: order.id });
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
      log.info("atomiq tryClaim skip", { orderId: order.id, reason: "not claimable" });
      return { success: false };
    }
    log.info("atomiq tryClaim start", { orderId: order.id });
    const txId = await swap.claim();
    log.info("atomiq tryClaim success", { orderId: order.id, txId });
    return { success: true, txId };
  }

  async tryRefund(order: BridgeOrder): Promise<{ success: boolean; txId?: string }> {
    const swap = await this.getSwap(order);
    if (!swap.isRefundable?.() || !swap.refund) {
      log.info("atomiq tryRefund skip", { orderId: order.id, reason: "not refundable" });
      return { success: false };
    }
    log.info("atomiq tryRefund start", { orderId: order.id });
    const txId = await swap.refund();
    log.info("atomiq tryRefund success", { orderId: order.id, txId });
    return { success: true, txId };
  }
}
