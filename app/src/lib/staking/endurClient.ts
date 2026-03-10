import { RPC_URL, NETWORK } from "@/lib/constants";
import { hash } from "starknet";

const XSTRK_MAINNET =
  "0x028d709c875c0ceac3dce7065bec5328186dc89fe254527084d1689910954b0a";
const XSTRK_SEPOLIA =
  "0x042de5b868da876768213c48019b8d46cd484e66013ae3275f8a4b97b31fc7eb";

const STRK_ADDRESS =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

export const ENDUR_XSTRK_ADDRESS =
  NETWORK === "mainnet" ? XSTRK_MAINNET : XSTRK_SEPOLIA;

export const ENDUR_STRK_ADDRESS = STRK_ADDRESS;

// ── RPC helper ──────────────────────────────────────────

async function rpcCall<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });

  const payload = (await res.json().catch(() => ({}))) as {
    result?: T;
    error?: { message?: string };
  };

  if (!res.ok || payload.error) {
    throw new Error(payload.error?.message || `RPC call failed (${res.status})`);
  }

  return payload.result as T;
}

async function starknetCall(
  contractAddress: string,
  entrypoint: string,
  calldata: string[] = []
): Promise<string[]> {
  const selector = hash.getSelectorFromName(entrypoint);
  return rpcCall<string[]>("starknet_call", [
    { contract_address: contractAddress, entry_point_selector: selector, calldata },
    "latest",
  ]);
}

// ── u256 helpers ────────────────────────────────────────

function parseU256(low: string, high: string): bigint {
  return BigInt(low) + (BigInt(high) << 128n);
}

function formatUnits(value: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = value / divisor;
  const remainder = value % divisor;
  if (remainder === 0n) return whole.toString();
  const fractional = remainder.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}.${fractional}`;
}

function parseUnits(value: string, decimals: number): bigint {
  const parts = value.split(".");
  const whole = BigInt(parts[0] || "0") * 10n ** BigInt(decimals);
  if (!parts[1]) return whole;
  const frac = parts[1].padEnd(decimals, "0").slice(0, decimals);
  return whole + BigInt(frac);
}

export function splitU256(value: bigint): { low: string; high: string } {
  const mask = (1n << 128n) - 1n;
  return {
    low: `0x${(value & mask).toString(16)}`,
    high: `0x${(value >> 128n).toString(16)}`,
  };
}

// ── View functions ──────────────────────────────────────

export type EndurPoolInfo = {
  totalAssets: string;
  totalSupply: string;
  exchangeRate: string;
};

export async function getEndurPoolInfo(): Promise<EndurPoolInfo> {
  const [totalAssetsRaw, totalSupplyRaw] = await Promise.all([
    starknetCall(ENDUR_XSTRK_ADDRESS, "total_assets"),
    starknetCall(ENDUR_XSTRK_ADDRESS, "total_supply"),
  ]);

  const totalAssets = parseU256(totalAssetsRaw[0], totalAssetsRaw[1]);
  const totalSupply = parseU256(totalSupplyRaw[0], totalSupplyRaw[1]);

  const rate =
    totalSupply > 0n
      ? Number(totalAssets) / Number(totalSupply)
      : 1;

  return {
    totalAssets: formatUnits(totalAssets, 18),
    totalSupply: formatUnits(totalSupply, 18),
    exchangeRate: rate.toFixed(6),
  };
}

export type EndurPosition = {
  xstrkBalance: string;
  strkValue: string;
  rewards: string;
};

export async function getEndurPosition(
  userAddress: string
): Promise<EndurPosition | null> {
  const balanceRaw = await starknetCall(ENDUR_XSTRK_ADDRESS, "balance_of", [
    userAddress,
  ]);
  const shares = parseU256(balanceRaw[0], balanceRaw[1]);

  if (shares === 0n) return null;

  const { low, high } = splitU256(shares);
  const convertRaw = await starknetCall(ENDUR_XSTRK_ADDRESS, "convert_to_assets", [
    low,
    high,
  ]);
  const strkValue = parseU256(convertRaw[0], convertRaw[1]);
  const rewards = strkValue > shares ? strkValue - shares : 0n;

  return {
    xstrkBalance: formatUnits(shares, 18),
    strkValue: formatUnits(strkValue, 18),
    rewards: formatUnits(rewards, 18),
  };
}

export async function getStrkBalance(userAddress: string): Promise<string> {
  const raw = await starknetCall(STRK_ADDRESS, "balanceOf", [userAddress]);
  const balance = parseU256(raw[0], raw[1]);
  return formatUnits(balance, 18);
}

// ── Transaction builders ────────────────────────────────

/**
 * Build multicall for depositing STRK into xSTRK vault.
 * 1. Approve xSTRK contract to spend STRK
 * 2. Call deposit(assets, receiver) on xSTRK
 */
export function buildEndurDepositCalls(
  amount: string,
  receiverAddress: string
) {
  const amountWei = parseUnits(amount, 18);
  const { low, high } = splitU256(amountWei);

  return [
    {
      contractAddress: STRK_ADDRESS,
      entrypoint: "approve",
      calldata: [ENDUR_XSTRK_ADDRESS, low, high],
    },
    {
      contractAddress: ENDUR_XSTRK_ADDRESS,
      entrypoint: "deposit",
      calldata: [low, high, receiverAddress],
    },
  ];
}

/**
 * Build call for withdrawing from xSTRK vault.
 * redeem(shares, receiver, owner)
 */
export function buildEndurWithdrawCalls(
  xstrkAmount: string,
  receiverAddress: string
) {
  const amountWei = parseUnits(xstrkAmount, 18);
  const { low, high } = splitU256(amountWei);

  return [
    {
      contractAddress: ENDUR_XSTRK_ADDRESS,
      entrypoint: "redeem",
      calldata: [low, high, receiverAddress, receiverAddress],
    },
  ];
}
