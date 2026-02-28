import { BitcoinNetwork, SwapAmountType, SwapperFactory } from "@atomiqlabs/sdk";
import { StarknetInitializer } from "@atomiqlabs/chain-starknet";
import { RpcProvider } from "starknet";
import { BridgeAmountType, BridgeNetwork, BridgeOrder, BridgePrepareResult, BridgeSubmitInput } from "./types.js";
import { settings } from "../settings.js";
import { PostgresUnifiedStorage } from "./postgresStorage.js";
import { InMemoryChainStorage } from "./inMemoryStorage.js";

const DESTINATION_DECIMALS: Record<string, number> = {
  WBTC: 8,
  TBTC: 18,
  ETH: 18,
  STRK: 18,
  USDC: 6,
  USDT: 6,
  _TESTNET_WBTC_VESU: 8,
};

/**
 * Convert satoshis to destination token base units.
 * API always accepts amount in satoshis for both exactIn and exactOut.
 * - 8-decimal tokens (WBTC, TBTC): 1:1 (1 sat ≈ 1 unit)
 * - 6-decimal (USDC, USDT): 1 sat ≈ $0.001 → 1000 units (at ~$100k/BTC)
 * - 18-decimal (ETH, STRK): 1 sat ≈ $0.001 → 10^15 wei (at ~$100k/BTC, ~$2k/ETH)
 */
function satoshisToDestinationUnits(satoshis: bigint, decimals: number): bigint {
  if (decimals >= 8) {
    return satoshis * 10n ** BigInt(decimals - 8);
  }
  if (decimals === 6) {
    return satoshis * 1000n;
  }
  if (decimals === 18) {
    return satoshis * 10n ** 15n;
  }
  return satoshis;
}

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
  amountSourceSats: string;
  amountDestinationUnits: string;
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
  private swapperPromise: Promise<any> | null = null;

  private async getSwapper(_network: BridgeNetwork): Promise<any> {
    if (this.swapperPromise) {
      return this.swapperPromise;
    }

    const provider = new RpcProvider({ nodeUrl: settings.rpc_url });
    const chainId = await provider.getChainId();
    const networkValue = settings.network === "mainnet" ? BitcoinNetwork.MAINNET : BitcoinNetwork.TESTNET;

    this.swapperPromise = this.factory.newSwapperInitialized({
      chains: {
        STARKNET: {
          rpcUrl: settings.rpc_url,
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
    // API always accepts amount in satoshis for both exactIn and exactOut.
    const amountSatoshis = BigInt(input.amount);
    const decimals =
      DESTINATION_DECIMALS[ticker] ?? DESTINATION_DECIMALS[input.destinationAsset] ?? 8;
    const amountForSdk =
      amountType === SwapAmountType.EXACT_IN
        ? amountSatoshis
        : satoshisToDestinationUnits(amountSatoshis, decimals);

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

    const amountIn = getAmountLike(swap.getInput?.());
    const amountOut = getAmountLike(swap.getOutput?.());
    const quote: Record<string, unknown> = {
      amountIn,
      amountOut,
      depositAddress: swap.getAddress?.() ?? null,
    };

    const timeout = swap.getTimeoutTime?.();
    return {
      atomiqSwapId,
      statusRaw: swap.getState?.(),
      quote,
      expiresAt: typeof timeout === "number" ? new Date(timeout).toISOString() : null,
      amountSourceSats: amountIn ?? input.amount,
      amountDestinationUnits: amountOut ?? String(amountForSdk),
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
