import { BitcoinNetwork, SwapAmountType, SwapperFactory } from "@atomiqlabs/sdk";
import { StarknetInitializer } from "@atomiqlabs/chain-starknet";
import { RpcProvider } from "starknet";
import { log } from "../logger.js";
import { BridgeAmountType, BridgeNetwork, BridgeOrder } from "./types.js";
import { settings } from "../settings.js";
import { PostgresUnifiedStorage } from "./postgresStorage.js";
import { InMemoryChainStorage } from "./inMemoryStorage.js";
import {
  baseUnitsToTokenAmount,
  getSourceDecimals,
  getDestinationDecimals,
  tokenAmountToBaseUnits,
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
  claim?: (...args: unknown[]) => Promise<string>;
  refund?: (...args: unknown[]) => Promise<string>;
  isClaimable?: () => boolean;
  isRefundable?: () => boolean;
  [key: string]: unknown;
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
  depositAddress: string | null;
};

type BitcoinPaymentDetails =
  | {
      type: "ADDRESS";
      address: string;
      amountSats: string | null;
      hyperlink: string | null;
    }
  | {
      type: "FUNDED_PSBT";
      psbtHex: string | null;
      psbtBase64: string | null;
      signInputs: number[];
    }
  | {
      type: "RAW_PSBT";
      psbtHex: string | null;
      psbtBase64: string | null;
      in1sequence: number | null;
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

function toBaseUnits(value: unknown, decimals: number): string | null {
  if (value == null) return null;
  if (typeof value === "bigint") return value.toString(10);
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return raw;
  if (/^\d+(\.\d+)?$/.test(raw)) {
    return tokenAmountToBaseUnits(raw, decimals).toString(10);
  }
  return null;
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isLikelyBtcAddress(value: string): boolean {
  return /^(bc1|tb1|[13]|[mn2])[a-zA-Z0-9]{20,}$/i.test(value);
}

function findLikelyBtcAddressDeep(raw: unknown, depth = 0): string | null {
  if (depth > 8) return null;
  if (typeof raw === "string") {
    const candidate = normalizeString(raw);
    return candidate && isLikelyBtcAddress(candidate) ? candidate : null;
  }
  if (!raw || typeof raw !== "object") return null;
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const found = findLikelyBtcAddressDeep(entry, depth + 1);
      if (found) return found;
    }
    return null;
  }
  for (const value of Object.values(raw as Record<string, unknown>)) {
    const found = findLikelyBtcAddressDeep(value, depth + 1);
    if (found) return found;
  }
  return null;
}

function collectAddressCandidates(raw: unknown, max = 10, depth = 0, acc: string[] = []): string[] {
  if (acc.length >= max || depth > 8) return acc;
  if (typeof raw === "string") {
    const candidate = normalizeString(raw);
    if (candidate && isLikelyBtcAddress(candidate) && !acc.includes(candidate)) {
      acc.push(candidate);
    }
    return acc;
  }
  if (!raw || typeof raw !== "object") return acc;
  if (Array.isArray(raw)) {
    for (const value of raw) {
      collectAddressCandidates(value, max, depth + 1, acc);
      if (acc.length >= max) break;
    }
    return acc;
  }
  for (const value of Object.values(raw as Record<string, unknown>)) {
    collectAddressCandidates(value, max, depth + 1, acc);
    if (acc.length >= max) break;
  }
  return acc;
}

function resolveSteps(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];
  const entry = raw as Record<string, unknown>;
  if (Array.isArray(entry.steps)) return entry.steps;
  if (Array.isArray(entry.txs)) return entry.txs;
  return [];
}

function parseDepositFromTx(raw: unknown): { depositAddress: string | null; amountSats: string | null } {
  if (!raw || typeof raw !== "object") return { depositAddress: null, amountSats: null };
  const tx = raw as Record<string, unknown>;
  const depositAddress =
    normalizeString(tx.address) ??
    normalizeString(tx.depositAddress) ??
    normalizeString(tx.btcAddress) ??
    normalizeString(tx.destinationAddress);
  const amountSats = toBaseUnits(tx.amount ?? tx.amountSats ?? tx.value ?? tx.rawAmount, getSourceDecimals());
  return {
    depositAddress: depositAddress && isLikelyBtcAddress(depositAddress) ? depositAddress : null,
    amountSats,
  };
}

function normalizeIntegerString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value).toString(10);
  }
  if (typeof value === "bigint") return value.toString(10);
  const raw = String(value).trim();
  return /^\d+$/.test(raw) ? raw : null;
}

function normalizeNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const values: number[] = [];
  for (const item of value) {
    if (typeof item === "number" && Number.isInteger(item)) {
      values.push(item);
      continue;
    }
    const parsed = Number(item);
    if (Number.isInteger(parsed)) values.push(parsed);
  }
  return values;
}

function parseBitcoinPaymentFromTx(raw: unknown): BitcoinPaymentDetails | null {
  if (!raw || typeof raw !== "object") return null;
  const tx = raw as Record<string, unknown>;
  const paymentType = normalizeString(tx.type)?.toUpperCase();
  if (paymentType === "ADDRESS") {
    const address = normalizeString(tx.address);
    if (!address) return null;
    return {
      type: "ADDRESS",
      address,
      amountSats: toBaseUnits(tx.amount, getSourceDecimals()) ?? normalizeIntegerString(tx.amountSats ?? tx.value),
      hyperlink: normalizeString(tx.hyperlink),
    };
  }
  if (paymentType === "FUNDED_PSBT") {
    return {
      type: "FUNDED_PSBT",
      psbtHex: normalizeString(tx.psbtHex),
      psbtBase64: normalizeString(tx.psbtBase64),
      signInputs: normalizeNumberArray(tx.signInputs),
    };
  }
  if (paymentType === "RAW_PSBT") {
    const in1sequence = Number(tx.in1sequence);
    return {
      type: "RAW_PSBT",
      psbtHex: normalizeString(tx.psbtHex),
      psbtBase64: normalizeString(tx.psbtBase64),
      in1sequence: Number.isFinite(in1sequence) ? in1sequence : null,
    };
  }
  return null;
}

function parseBitcoinPaymentFromTxsExecute(raw: unknown): BitcoinPaymentDetails | null {
  const steps = resolveSteps(raw);
  for (const step of steps) {
    if (!step || typeof step !== "object") continue;
    const entry = step as Record<string, unknown>;
    const stepName = normalizeString(entry.name)?.toLowerCase();
    if (stepName && !stepName.includes("payment")) continue;
    const chain = normalizeString(entry.chain)?.toUpperCase();
    if (chain && chain !== "BITCOIN") continue;
    const txs = resolveSteps(entry);
    for (const tx of txs) {
      const parsed = parseBitcoinPaymentFromTx(tx);
      if (parsed) return parsed;
    }
  }
  for (const step of steps) {
    const txs = resolveSteps(step);
    for (const tx of txs) {
      const parsed = parseBitcoinPaymentFromTx(tx);
      if (parsed) return parsed;
    }
  }
  return null;
}

function parseDepositFromTxsExecute(raw: unknown): { depositAddress: string | null; amountSats: string | null } {
  const steps = resolveSteps(raw);
  for (const step of steps) {
    if (!step || typeof step !== "object") continue;
    const entry = step as Record<string, unknown>;
    const stepName = normalizeString(entry.name)?.toLowerCase();
    const txs = resolveSteps(entry);
    if (stepName && !stepName.includes("payment") && !stepName.includes("deposit")) {
      continue;
    }
    for (const tx of txs) {
      const parsed = parseDepositFromTx(tx);
      if (parsed.depositAddress) return parsed;
    }
  }
  for (const step of steps) {
    const txs = resolveSteps(step);
    for (const tx of txs) {
      const parsed = parseDepositFromTx(tx);
      if (parsed.depositAddress) return parsed;
    }
  }
  const deepAddress = findLikelyBtcAddressDeep(raw);
  if (deepAddress) {
    return { depositAddress: deepAddress, amountSats: null };
  }
  return { depositAddress: null, amountSats: null };
}

function listSwapMethods(swap: AtomiqSwapLike): string[] {
  const methods = new Set<string>();
  let current: unknown = swap;
  let guard = 0;
  while (current && typeof current === "object" && guard < 6) {
    const proto = Object.getPrototypeOf(current);
    if (!proto) break;
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === "constructor") continue;
      const descriptor = Object.getOwnPropertyDescriptor(proto, name);
      if (descriptor && typeof descriptor.value === "function") {
        methods.add(name);
      }
    }
    current = proto;
    guard += 1;
  }
  return Array.from(methods);
}

async function resolveDepositAddressFromSwapMethods(swap: AtomiqSwapLike): Promise<string | null> {
  const methods = listSwapMethods(swap);
  const addressMethods = methods.filter((name) => /^get/i.test(name) && /address/i.test(name));
  for (const method of addressMethods) {
    const fn = swap[method];
    if (typeof fn !== "function") continue;
    try {
      const value = await Promise.resolve((fn as () => unknown).call(swap));
      const candidate = normalizeString(value) ?? findLikelyBtcAddressDeep(value);
      if (candidate && isLikelyBtcAddress(candidate)) {
        return candidate;
      }
    } catch {
      // Best-effort fallback probing.
    }
  }
  return null;
}

export interface AtomiqClient {
  createIncomingSwap(input: CreateIncomingSwapInput): Promise<CreateIncomingSwapResult>;
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

    let txsExecuteRaw: unknown = null;
    if (swap.txsExecute) {
      try {
        txsExecuteRaw = await swap.txsExecute();
        log.debug("atomiq txsExecute returned", {
          isArray: Array.isArray(txsExecuteRaw),
          topLevelKeys:
            txsExecuteRaw && typeof txsExecuteRaw === "object"
              ? Object.keys(txsExecuteRaw as Record<string, unknown>).slice(0, 10)
              : [],
        });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        log.warn("atomiq txsExecute failed while creating swap", { error: msg });
      }
    }
    const deposit = parseDepositFromTxsExecute(txsExecuteRaw);
    const bitcoinPayment = parseBitcoinPaymentFromTxsExecute(txsExecuteRaw);
    const fallbackDepositAddress =
      normalizeString(swap.getAddress?.()) ??
      (await resolveDepositAddressFromSwapMethods(swap)) ??
      findLikelyBtcAddressDeep(swap.getInput?.()) ??
      findLikelyBtcAddressDeep(swap.getOutput?.());
    const paymentAddress = bitcoinPayment?.type === "ADDRESS" ? bitcoinPayment.address : null;
    const resolvedDepositAddress = paymentAddress ?? deposit.depositAddress ?? fallbackDepositAddress;
    const paymentAmountSats = bitcoinPayment?.type === "ADDRESS" ? bitcoinPayment.amountSats : null;
    const resolvedAmountSats = paymentAmountSats ?? deposit.amountSats ?? input.amount;
    if (!resolvedDepositAddress) {
      log.warn("atomiq createIncomingSwap missing depositAddress", {
        atomiqSwapId,
        hasTxsExecuteRaw: txsExecuteRaw != null,
        hasSwapAddress: Boolean(fallbackDepositAddress),
        txsExecuteCandidates: collectAddressCandidates(txsExecuteRaw),
        inputCandidates: collectAddressCandidates(swap.getInput?.()),
        outputCandidates: collectAddressCandidates(swap.getOutput?.()),
        swapAddressMethods: listSwapMethods(swap).filter((name) => /address/i.test(name)).slice(0, 20),
        paymentType: bitcoinPayment?.type ?? null,
      });
    } else {
      log.debug("atomiq createIncomingSwap resolved depositAddress", {
        atomiqSwapId,
        fromPaymentAction: Boolean(paymentAddress),
        fromTxsExecute: Boolean(deposit.depositAddress),
        fromSwapAddress: Boolean(fallbackDepositAddress),
      });
    }

    const amountInRaw = getAmountLike(swap.getInput?.());
    const amountOutRaw = getAmountLike(swap.getOutput?.());
    const amountSource = toBaseUnits(amountInRaw, srcDecimals) ?? resolvedAmountSats;
    const amountDestination = toBaseUnits(amountOutRaw, dstDecimals) ?? input.amount;

    const quote: Record<string, unknown> = {
      amountIn: amountSource,
      amountOut: amountDestination,
      depositAddress: resolvedDepositAddress,
      bitcoinPayment,
    };

    const timeout = swap.getTimeoutTime?.();
    log.info("atomiq createIncomingSwap success", {
      atomiqSwapId,
      amountSource,
      amountDestination,
      depositAddress: resolvedDepositAddress,
    });
    return {
      atomiqSwapId,
      statusRaw: swap.getState?.(),
      quote,
      expiresAt: typeof timeout === "number" ? new Date(timeout).toISOString() : null,
      amountSource,
      amountDestination,
      depositAddress: resolvedDepositAddress,
    };
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
