import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useWallet } from "@/store/useWallet";
import { useDebounce } from "@/hooks/useDebounce";
import { useBtcBalance } from "@/hooks/useBtcBalance";
import { useBtcPrice } from "@/hooks/useBtcPrice";
import { LOGOS } from "@/lib/constants";
import {
  SWAP_SOURCE_ASSET,
  SWAP_DESTINATION_ASSETS,
  getSwapAssetIcon,
} from "@/lib/swap-assets";
import type { DstToken, SwapQuote } from "@/lib/atomiq/swapService";
import Button from "@/components/ui/Button";

// Strict validation: only numbers and a single decimal point
function sanitizeAmountInput(input: string, maxDecimals: number): string {
  if (!/^[0-9]*\.?[0-9]*$/.test(input)) return "";
  if (input.startsWith(".")) input = "0" + input;
  const parts = input.split(".");
  if (parts.length > 2) return "";
  if (parts[1] && parts[1].length > maxDecimals) {
    return parts[0] + "." + parts[1].slice(0, maxDecimals);
  }
  return input;
}

/** Safely convert bigint / BN / string / number to a JS number. Returns null if not valid. */
function toNum(val: unknown): number | null {
  if (val == null) return null;
  const n = Number(String(val));
  return Number.isFinite(n) ? n : null;
}

function formatBtcFromSats(val: unknown): string | null {
  const n = toNum(val);
  if (n == null) return null;
  const btc = n / 1e8;
  if (btc === 0) return "0";
  if (btc < 0.00001) return btc.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
  return btc.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

function stripTokenName(output: string): string {
  return output.replace(/[^0-9.,]/g, "").replace(/,+$/, "");
}

function formatUsd(usd: number): string {
  if (usd < 0.01) return "<$0.01";
  return "$" + usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const QUOTE_REFRESH_MS = 10_000;

export interface SwapFormProps {
  isInitialized: boolean;
  isInitializing: boolean;
  step: string;
  runSwap: (params: {
    dstToken: import("@/lib/atomiq/swapService").DstToken;
    amountBtc: string;
    action?: "swap" | "borrow" | "stake";
    destinationAsset?: string;
    onOrderCreated?: (orderId: string) => void;
  }) => Promise<string | null>;
  getSwapLimits: (dstToken: DstToken) => {
    minSats: bigint;
    maxSats: bigint;
    minBtc: string;
    maxBtc: string;
  } | null;
  getQuote: (amountBtc: string, dstToken: DstToken) => Promise<SwapQuote | null>;
  onConnectWallet?: () => void;
}

export function SwapForm({
  isInitialized,
  isInitializing,
  step,
  runSwap,
  getSwapLimits,
  getQuote,
  onConnectWallet,
}: SwapFormProps) {
  const { connected, bitcoinPaymentAddress, starknetAddress } = useWallet();
  const { balanceFormatted, balanceBtc, isLoading: btcBalanceLoading } = useBtcBalance();
  const btcPrice = useBtcPrice();

  const [amountBtc, setAmountBtc] = useState("");
  const [dstToken, setDstToken] = useState<DstToken>("ETH");
  const [inputError, setInputError] = useState<string | null>(null);
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [quoteExpiresAt, setQuoteExpiresAt] = useState<number>(0); // absolute ms
  const [countdown, setCountdown] = useState<number>(0); // seconds remaining
  const [isQuoteLoading, setIsQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const amountNum = parseFloat(amountBtc.replace(/,/g, "")) || 0;
  const debouncedAmount = useDebounce(amountBtc, 500);
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const limits = useMemo(
    () => (isInitialized ? getSwapLimits(dstToken) : null),
    [isInitialized, getSwapLimits, dstToken]
  );

  const minBtc = limits ? parseFloat(limits.minBtc) : 0;
  const maxBtc = limits ? parseFloat(limits.maxBtc) : Infinity;

  const isSwapping = step !== "idle" && step !== "settled" && step !== "error";

  // Validate amount on change
  useEffect(() => {
    setInputError(null);
    if (amountNum <= 0) return;
    if (limits && amountNum < minBtc) {
      setInputError(`Minimum ${limits.minBtc} BTC`);
      return;
    }
    if (limits && amountNum > maxBtc) {
      setInputError(`Maximum ${limits.maxBtc} BTC`);
      return;
    }
  }, [amountNum, limits, minBtc, maxBtc]);

  // Clear output/error when dstToken changes
  useEffect(() => {
    setInputError(null);
    setQuote(null);
    setQuoteError(null);
  }, [dstToken]);

  // Fetch quote function
  const fetchQuote = useCallback(async () => {
    const amt = parseFloat(debouncedAmount.replace(/,/g, "")) || 0;
    if (!debouncedAmount || amt <= 0 || !getQuote || inputError || !bitcoinPaymentAddress || !starknetAddress) {
      setQuote(null);
      setQuoteError(null);
      setIsQuoteLoading(false);
      return;
    }
    setIsQuoteLoading(true);
    setQuoteError(null);
    try {
      const q = await getQuote(debouncedAmount, dstToken);
      if (q) {
        setQuote(q);
        setQuoteExpiresAt(Date.now() + q.expirySeconds * 1000);
        setQuoteError(null);
      } else {
        setQuote(null);
        setQuoteError("Failed to get quote");
      }
    } catch (e) {
      setQuote(null);
      setQuoteError(e instanceof Error ? e.message : "Failed to get quote");
    } finally {
      setIsQuoteLoading(false);
    }
  }, [debouncedAmount, dstToken, getQuote, inputError, bitcoinPaymentAddress, starknetAddress]);

  // Fetch on change + auto-refresh every 10s
  useEffect(() => {
    fetchQuote();
    if (refreshRef.current) clearInterval(refreshRef.current);
    const amt = parseFloat(debouncedAmount.replace(/,/g, "")) || 0;
    if (debouncedAmount && amt > 0 && !inputError && bitcoinPaymentAddress && starknetAddress) {
      refreshRef.current = setInterval(fetchQuote, QUOTE_REFRESH_MS);
    }
    return () => {
      if (refreshRef.current) clearInterval(refreshRef.current);
    };
  }, [fetchQuote, debouncedAmount, inputError, bitcoinPaymentAddress, starknetAddress]);

  // Live countdown timer
  useEffect(() => {
    if (!quoteExpiresAt) { setCountdown(0); return; }
    const tick = () => {
      const remaining = Math.max(0, Math.floor((quoteExpiresAt - Date.now()) / 1000));
      setCountdown(remaining);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [quoteExpiresAt]);

  const handleAmountChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      const sanitized = sanitizeAmountInput(raw, SWAP_SOURCE_ASSET.decimals);
      setAmountBtc(sanitized);
    },
    []
  );

  const setAmountFromPct = useCallback(
    (pct: number) => {
      if (balanceBtc > 0 && pct > 0) {
        const amount = (balanceBtc * pct) / 100;
        setAmountBtc(amount.toFixed(8).replace(/\.?0+$/, ""));
      }
    },
    [balanceBtc]
  );

  const canSwap =
    isInitialized &&
    connected &&
    !!amountBtc &&
    amountNum > 0 &&
    !inputError &&
    !isSwapping;

  const handleSwap = useCallback(() => {
    if (!canSwap) return;
    runSwap({
      dstToken,
      amountBtc,
      action: "swap",
    }).catch(() => {
      // Errors logged in hook
    });
  }, [canSwap, runSwap, dstToken, amountBtc]);

  const destAsset = SWAP_DESTINATION_ASSETS.find((a) => a.symbol === dstToken);

  // Derive swap details from quote (safe conversions)
  const outputNum = quote ? stripTokenName(quote.output) : null;
  const outputParsed = outputNum ? parseFloat(outputNum) : null;
  const rate = quote && amountNum > 0 && outputParsed && Number.isFinite(outputParsed)
    ? (outputParsed / amountNum).toFixed(4)
    : null;
  const feeBtcStr = quote ? formatBtcFromSats(quote.fees) : null;
  const inputWithFeesStr = quote ? formatBtcFromSats(quote.inputWithFees) : null;

  // USD values
  const payUsd = btcPrice && amountNum > 0 ? amountNum * btcPrice : null;
  const receiveUsd = btcPrice && rate && outputParsed && Number.isFinite(outputParsed)
    ? (() => {
        // derive dest token USD from rate: destPrice = btcPrice / rate
        const rateNum = parseFloat(rate);
        if (!rateNum || !Number.isFinite(rateNum)) return null;
        const destPrice = btcPrice / rateNum;
        return outputParsed * destPrice;
      })()
    : null;

  return (
    <div className="space-y-1.5">
      {/* You pay card */}
      <div className="rounded-amplifi bg-white p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={LOGOS.import} alt="input" className="h-4 w-4 text-amplifi-text" />
            <span className="text-base text-amplifi-text">You pay</span>
          </div>
          {balanceFormatted != null && balanceBtc > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-base text-amplifi-muted">
                {btcBalanceLoading ? "…" : balanceFormatted} BTC
              </span>
              <button
                type="button"
                onClick={() => setAmountFromPct(50)}
                className="rounded-[4px] border border-[#E4E4E4] px-2 py-0.5 text-sm text-amplifi-muted hover:border-amplifi-primary hover:text-amplifi-primary active:bg-amplifi-primary/5 transition-colors cursor-pointer"
              >
                50%
              </button>
              <button
                type="button"
                onClick={() => setAmountFromPct(100)}
                className="rounded-[4px] border border-[#E4E4E4] px-2 py-0.5 text-sm text-amplifi-muted hover:border-amplifi-primary hover:text-amplifi-primary active:bg-amplifi-primary/5 transition-colors cursor-pointer"
              >
                Max
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <input
              type="text"
              inputMode="decimal"
              value={amountBtc}
              onChange={handleAmountChange}
              placeholder="0.00"
              className="w-full min-w-0 border-0 bg-transparent p-0 text-4xl font-medium text-amplifi-amount outline-none placeholder:text-amplifi-text-muted focus:ring-0"
              aria-label="Amount BTC"
              disabled={isSwapping}
            />
            {payUsd != null && amountNum > 0 && (
              <p className="mt-1 text-sm text-amplifi-muted">{formatUsd(payUsd)}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-full bg-amplifi-surface-muted py-1.5 pl-1.5 pr-3">
            <img
              src={SWAP_SOURCE_ASSET.icon}
              alt=""
              className="h-7 w-7 rounded-full object-cover"
            />
            <span className="text-sm font-medium text-amplifi-text">BTC</span>
          </div>
        </div>
        {inputError && (
          <p className="mt-2 text-sm text-red-600">{inputError}</p>
        )}
      </div>

      {/* You receive card */}
      <div className="rounded-amplifi bg-white p-4 sm:p-6">
        <div className="mb-3 flex items-center gap-2">
          <img src={LOGOS.export} alt="output" className="h-4 w-4 text-amplifi-text" />
          <span className="text-base text-amplifi-text">You receive</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-4xl font-medium text-amplifi-amount min-h-[2.25rem] flex items-center">
              {isQuoteLoading && !quote ? (
                <span className="text-amplifi-muted text-2xl">Fetching quote…</span>
              ) : quoteError ? (
                <span className="text-red-600 text-lg">{quoteError}</span>
              ) : quote && amountNum > 0 && !inputError && outputNum ? (
                <span className="text-amplifi-amount">≈ {outputNum}</span>
              ) : amountNum > 0 && !inputError ? (
                <span className="text-amplifi-muted">≈ —</span>
              ) : (
                <span className="text-amplifi-muted/80">0</span>
              )}
            </div>
            {receiveUsd != null && quote && amountNum > 0 && !inputError && (
              <p className="mt-1 text-sm text-amplifi-muted">{formatUsd(receiveUsd)}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <img
              src={destAsset?.icon ?? getSwapAssetIcon(dstToken)}
              alt=""
              className="h-7 w-7 rounded-full object-cover"
            />
            <select
              value={dstToken}
              onChange={(e) => setDstToken(e.target.value as DstToken)}
              className="rounded-full border border-amplifi-border bg-amplifi-surface-muted px-3 py-1.5 text-sm font-medium text-amplifi-text focus:outline-none focus:ring-2 focus:ring-amplifi-primary/30"
              disabled={isSwapping}
            >
              {SWAP_DESTINATION_ASSETS.map((a) => (
                <option key={a.symbol} value={a.symbol}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Swap details */}
      {quote && amountNum > 0 && !inputError && (
        <div className="rounded-amplifi bg-white px-4 py-3 sm:px-6">
          <div className="space-y-2 text-sm">
            {rate && (
              <div className="flex items-center justify-between">
                <span className="text-amplifi-muted">Rate</span>
                <span className="font-medium text-amplifi-text">
                  1 BTC ≈ {rate} {dstToken}
                </span>
              </div>
            )}
            {feeBtcStr && (
              <div className="flex items-center justify-between">
                <span className="text-amplifi-muted">Network fee</span>
                <span className="font-medium text-amplifi-text">
                  {feeBtcStr} BTC
                </span>
              </div>
            )}
            {inputWithFeesStr && (
              <div className="flex items-center justify-between">
                <span className="text-amplifi-muted">You send (incl. fees)</span>
                <span className="font-medium text-amplifi-text">
                  {inputWithFeesStr} BTC
                </span>
              </div>
            )}
            {countdown > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-amplifi-muted">Quote refreshes in</span>
                <span className="font-medium text-amplifi-text tabular-nums">
                  {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Swap button */}
      <div className="pt-3">
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          disabled={!canSwap}
          onClick={connected ? handleSwap : onConnectWallet}
        >
          {isSwapping
            ? step === "creating_order"
              ? "Creating order…"
              : step === "creating_swap"
                ? "Creating swap…"
                : step === "sending_btc"
                  ? "Sending BTC…"
                  : step === "confirming_btc"
                    ? "Confirming BTC…"
                    : step === "claiming"
                      ? "Claiming…"
                      : "Swapping…"
            : isInitializing
              ? "Initializing…"
              : connected
                ? "Swap"
                : "Connect Wallet"}
        </Button>
      </div>

      {!connected && (
        <p className="text-center text-xs text-amplifi-muted pt-1">
          Connect both Bitcoin and Starknet wallets to swap
        </p>
      )}
    </div>
  );
}
