import { validateAndParseAddress } from "starknet";
import { asString } from "../aggregatorUtils.js";
import { settings } from "../settings.js";
import { BridgeAmountType, BridgeCreateOrderInput } from "./types.js";
const SUPPORTED_DESTINATION_ASSETS = new Set(["USDC", "ETH", "STRK", "WBTC", "USDT", "TBTC"]);

export function normalizeWalletAddress(value: string): string {
  return value.trim().toLowerCase();
}

export function validateAmountType(value: unknown): BridgeAmountType {
  const normalized = asString(value).trim();
  if (normalized !== "exactIn" && normalized !== "exactOut") {
    throw new Error("amountType must be one of: exactIn, exactOut");
  }
  return normalized;
}

export function validatePositiveIntegerString(value: unknown, field: string): string {
  const normalized = asString(value).trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${field} must be a positive integer string`);
  }
  if (BigInt(normalized) <= 0n) {
    throw new Error(`${field} must be greater than zero`);
  }
  return normalized;
}

export function validateTokenAmount(value: unknown, field: string): string {
  const normalized = asString(value).trim();
  if (!normalized) {
    throw new Error(`${field} is required`);
  }
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error(`${field} must be a valid token amount (e.g. "0.001" or "100")`);
  }
  if (/^0(\.0*)?$/.test(normalized)) {
    throw new Error(`${field} must be greater than zero`);
  }
  return normalized;
}

export function validateDestinationAsset(value: unknown): string {
  const normalized = asString(value).trim().toUpperCase();
  if (!SUPPORTED_DESTINATION_ASSETS.has(normalized)) {
    throw new Error(
      "destinationAsset is unsupported, use one of: USDC, ETH, STRK, WBTC, USDT, TBTC"
    );
  }
  return normalized;
}

export function validateStarknetReceiveAddress(value: unknown): string {
  const raw = asString(value).trim();
  if (!raw) {
    throw new Error("receiveAddress is required");
  }
  try {
    return validateAndParseAddress(raw).toLowerCase();
  } catch {
    throw new Error("receiveAddress must be a valid Starknet address");
  }
}

export function validateCreateOrderPayload(payload: unknown): BridgeCreateOrderInput {
  const body = (payload ?? {}) as Record<string, unknown>;
  const sourceAsset = asString(body.sourceAsset).trim().toUpperCase();
  if (sourceAsset !== "BTC") {
    throw new Error("sourceAsset must be BTC for incoming bridge");
  }

  const walletAddress = normalizeWalletAddress(asString(body.walletAddress));
  if (!walletAddress) {
    throw new Error("walletAddress is required");
  }

  return {
    network: settings.network,
    sourceAsset: "BTC",
    destinationAsset: validateDestinationAsset(body.destinationAsset),
    amount: validatePositiveIntegerString(body.amount, "amount"),
    amountType: validateAmountType(body.amountType),
    receiveAddress: validateStarknetReceiveAddress(body.receiveAddress),
    walletAddress,
  };
}
