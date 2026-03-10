import {
  BitcoinNetwork,
  FeeType,
  SwapperFactory,
  SpvFromBTCSwapState,
} from "@atomiqlabs/sdk";
import type { BitcoinWallet } from "@atomiqlabs/sdk";
import {
  RpcProviderWithRetries,
  StarknetInitializer,
  StarknetInitializerType,
  StarknetSigner,
} from "@atomiqlabs/chain-starknet";

const factory = new SwapperFactory<[StarknetInitializerType]>([
  StarknetInitializer,
]);

export const Tokens = factory.Tokens;

export type DstToken = "ETH" | "STRK" | "WBTC";

export function getStarknetToken(dst: DstToken) {
  if (dst === "ETH") return Tokens.STARKNET.ETH;
  if (dst === "WBTC") return Tokens.STARKNET._TESTNET_WBTC_VESU;
  return Tokens.STARKNET.STRK;
}

export interface SwapQuote {
  swapId: string;
  inputWithoutFee: bigint;
  fees: bigint;
  feeBreakdown: { type: string; amount: bigint }[];
  inputWithFees: bigint;
  output: string;
  expirySeconds: number;
}

export interface SwapHandle {
  /** Internal swap object — opaque to consumers */
  _swap: unknown;
  swapId: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Swapper = any;
let _swapper: Swapper | null = null;
let _initPromise: Promise<Swapper> | null = null;
let _initArgs: { btcNetwork: BitcoinNetwork; rpcUrl: string } | null = null;

/**
 * Initializes the swapper singleton. Safe to call multiple times —
 * returns the existing instance if already initialized with the same args.
 */
export async function initSwapper(
  btcNetwork: BitcoinNetwork,
  starknetRpcUrl: string
): Promise<Swapper> {
  // Already initialized or in progress with same args — return existing promise
  if (
    _initPromise &&
    _initArgs?.btcNetwork === btcNetwork &&
    _initArgs?.rpcUrl === starknetRpcUrl
  ) {
    return _initPromise;
  }

  _initArgs = { btcNetwork, rpcUrl: starknetRpcUrl };
  _initPromise = (async () => {
    const rpc = new RpcProviderWithRetries({ nodeUrl: starknetRpcUrl });
    const swapper = factory.newSwapper({
      chains: { STARKNET: { rpcUrl: rpc } },
      bitcoinNetwork: btcNetwork,
    });
    await swapper.init();
    _swapper = swapper;
    return swapper;
  })();

  // If init fails, clear so next call retries
  _initPromise.catch(() => {
    _initPromise = null;
    _initArgs = null;
    _swapper = null;
  });

  return _initPromise;
}

export function getSwapper(): Swapper | null {
  return _swapper;
}

export async function stopSwapper(): Promise<void> {
  // Only stop — don't null out the singleton so in-flight calls still work.
  // A new initSwapper call will replace it.
  const swapper = _swapper;
  if (swapper) {
    try { await swapper.stop(); } catch { /* ignore */ }
  }
}

export async function createSwap(params: {
  dstToken: DstToken;
  amountSats: bigint;
  exactIn: boolean;
  bitcoinAddress: string;
  starknetAddress: string;
  onStateChange?: (state: string) => void;
}): Promise<{ quote: SwapQuote; handle: SwapHandle }> {
  // Wait for pending initialization before proceeding
  if (_initPromise) {
    try { await _initPromise; } catch { /* init error will surface below */ }
  }
  const swapper = _swapper;
  if (!swapper) throw new Error("Swapper not initialized — check wallet connection and network");

  const token = getStarknetToken(params.dstToken);

  // Pad Starknet address to 66 chars (0x + 64 hex) — SDK requires full-length
  const starkAddr = params.starknetAddress.startsWith("0x")
    ? "0x" + params.starknetAddress.slice(2).padStart(64, "0")
    : params.starknetAddress;

  // Validate amount against swap limits
  // getSwapLimits returns TokenAmount objects with { rawAmount: bigint, toString(): string }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let limits: { input?: { min?: any; max?: any }; output?: { min?: any; max?: any } } | null = null;
  let minSats: bigint | null = null;
  let maxSats: bigint | null = null;
  try {
    limits = swapper.getSwapLimits(Tokens.BITCOIN.BTC, token);
    minSats = limits?.input?.min?.rawAmount ?? null;
    maxSats = limits?.input?.max?.rawAmount ?? null;
    console.log("[atomiq] swap limits:", {
      inputMin: minSats?.toString(),
      inputMax: maxSats?.toString(),
      amount: params.amountSats.toString(),
    });
  } catch {
    // limits not available yet — proceed without validation
  }
  if (minSats != null && params.amountSats < minSats) {
    throw new Error(
      `Amount too small: ${params.amountSats.toString()} sats, minimum is ${minSats.toString()} sats`
    );
  }
  if (maxSats != null && params.amountSats > maxSats) {
    throw new Error(
      `Amount too large: ${params.amountSats.toString()} sats, maximum is ${maxSats.toString()} sats`
    );
  }

  let swap;
  try {
    swap = await swapper.swap(
      Tokens.BITCOIN.BTC,
      token,
      params.amountSats,
      params.exactIn,
      params.bitcoinAddress,
      starkAddr,
      {
        feeSafetyFactor: 1.25,
      }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // SDK throws NaN→BigInt error when a mempool/price API call fails or amount is unsupported
    if (msg.includes("NaN") || msg.includes("BigInt")) {
      const minStr = minSats?.toString() ?? "unknown";
      const maxStr = maxSats?.toString() ?? "unknown";
      throw new Error(
        `Swap failed (internal SDK error). Amount: ${params.amountSats.toString()} sats, ` +
        `accepted range: ${minStr}–${maxStr} sats. This may be a transient API error — please retry.`
      );
    }
    throw e;
  }

  const swapId = swap.getId();

  // Listen for state changes
  if (params.onStateChange) {
    swap.events.on("swapState", (updatedSwap: { getState(): number }) => {
      const state = updatedSwap.getState();
      params.onStateChange!(SpvFromBTCSwapState[state] ?? String(state));
    });
  }

  const feeBreakdown = swap.getFeeBreakdown().map(
    (f: { type: number; fee: { amountInSrcToken: bigint } }) => ({
      type: FeeType[f.type] ?? String(f.type),
      amount: f.fee.amountInSrcToken,
    })
  );

  const expiryTime = swap.getQuoteExpiry();
  const expirySeconds = Math.max(0, Math.floor((expiryTime - Date.now()) / 1000));

  return {
    quote: {
      swapId,
      inputWithoutFee: swap.getInputWithoutFee(),
      fees: swap.getFee().amountInSrcToken,
      feeBreakdown,
      inputWithFees: swap.getInput(),
      output: swap.getOutput().toString(),
      expirySeconds,
    },
    handle: { _swap: swap, swapId },
  };
}

export async function sendBtcTransaction(
  handle: SwapHandle,
  bitcoinWallet: BitcoinWallet
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const swap = handle._swap as any;

  // Compatibility patches for wallet interface
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wallet = bitcoinWallet as any;
  if (!wallet.publicKey && wallet.pubkey) {
    wallet.publicKey = wallet.pubkey;
  }
  if (!wallet.getAccounts && wallet.toBitcoinWalletAccounts) {
    wallet.getAccounts = () => wallet.toBitcoinWalletAccounts();
  }

  const txId = await swap.sendBitcoinTransaction(bitcoinWallet);
  return typeof txId === "string" ? txId : String(txId ?? "");
}

export async function waitForBtcConfirmation(
  handle: SwapHandle,
  confirmations = 1,
  onProgress?: (txId: string, current: number, target: number, etaMs: number) => void
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const swap = handle._swap as any;
  await swap.waitForBitcoinTransaction(
    undefined,
    confirmations,
    onProgress
      ? (txId: string | null, current: number, target: number, etaMs: number) => {
          if (txId != null) onProgress(txId, current, target, etaMs);
        }
      : undefined
  );
}

export async function claimOrWaitForWatchtower(
  handle: SwapHandle,
  starknetSigner: StarknetSigner,
  timeoutMs = 30_000
): Promise<{ claimedBy: "watchtower" | "manual" }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const swap = handle._swap as any;
  try {
    await swap.waitTillClaimedOrFronted(AbortSignal.timeout(timeoutMs));
    return { claimedBy: "watchtower" };
  } catch {
    await swap.claim(starknetSigner);
    return { claimedBy: "manual" };
  }
}

export function getSwapLimits(dstToken: DstToken) {
  const swapper = _swapper;
  if (!swapper) return null;
  const token = getStarknetToken(dstToken);
  return swapper.getSwapLimits(Tokens.BITCOIN.BTC, token);
}
