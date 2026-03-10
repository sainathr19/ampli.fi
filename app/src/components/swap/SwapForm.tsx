import { useState, useEffect, useCallback, useMemo } from "react";
import { useWallet } from "@/store/useWallet";
import { useDebounce } from "@/hooks/useDebounce";
import { useBtcBalance } from "@/hooks/useBtcBalance";
import { LOGOS } from "@/lib/constants";
import {
  SWAP_SOURCE_ASSET,
  SWAP_DESTINATION_ASSETS,
  getSwapAssetIcon,
} from "@/lib/swap-assets";
import type { DstToken } from "@/lib/atomiq/swapService";
import Button from "@/components/ui/Button";

// Strict validation: only numbers and a single decimal point (garden-kiosk pattern)
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
  getQuote: (amountBtc: string, dstToken: DstToken) => Promise<import("@/lib/atomiq/swapService").SwapQuote | null>;
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

  const [amountBtc, setAmountBtc] = useState("");
  const [dstToken, setDstToken] = useState<DstToken>("ETH");
  const [inputError, setInputError] = useState<string | null>(null);
  const [quote, setQuote] = useState<{ output: string } | null>(null);
  const [isQuoteLoading, setIsQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const amountNum = parseFloat(amountBtc.replace(/,/g, "")) || 0;
  const debouncedAmount = useDebounce(amountBtc, 500);

  const limits = useMemo(
    () => (isInitialized ? getSwapLimits(dstToken) : null),
    [isInitialized, getSwapLimits, dstToken]
  );

  const minBtc = limits ? parseFloat(limits.minBtc) : 0;
  const maxBtc = limits ? parseFloat(limits.maxBtc) : Infinity;

  const isSwapping = step !== "idle" && step !== "settled" && step !== "error";

  // Validate amount on change (garden-kiosk pattern)
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

  // Fetch quote when amount or dstToken changes (onesat pattern)
  const hasAddresses = !!(bitcoinPaymentAddress && starknetAddress);
  useEffect(() => {
    const amt = parseFloat(debouncedAmount.replace(/,/g, "")) || 0;
    if (!debouncedAmount || amt <= 0 || !getQuote || inputError || !hasAddresses) {
      setQuote(null);
      setQuoteError(null);
      setIsQuoteLoading(false);
      return;
    }
    let cancelled = false;
    setIsQuoteLoading(true);
    setQuoteError(null);
    getQuote(debouncedAmount, dstToken)
      .then((q) => {
        if (cancelled) return;
        if (q) {
          setQuote({ output: q.output });
          setQuoteError(null);
        } else {
          setQuote(null);
          setQuoteError("Failed to get quote");
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setQuote(null);
          setQuoteError(e instanceof Error ? e.message : "Failed to get quote");
        }
      })
      .finally(() => {
        if (!cancelled) setIsQuoteLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedAmount, dstToken, getQuote, inputError, hasAddresses]);

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-amplifi-text md:text-3xl">
          Swap
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-amplifi-text">
          Swap BTC to Starknet. Deposit BTC and receive ETH, STRK, or WBTC on
          Starknet Sepolia. Connect both wallets to swap.
        </p>
      </div>

      {/* From / Supply */}
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
                className="rounded-[4px] border border-[#E4E4E4] px-2 py-0.5 text-sm text-amplifi-muted"
              >
                50%
              </button>
              <button
                type="button"
                onClick={() => setAmountFromPct(100)}
                className="rounded-[4px] border border-[#E4E4E4] px-2 py-0.5 text-sm text-amplifi-muted"
              >
                Max
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-4">
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
          <div className="flex shrink-0 items-center gap-2">
            <img
              src={SWAP_SOURCE_ASSET.icon}
              alt=""
              className="h-8 w-8 rounded-full object-cover"
            />
            <span className="text-base text-amplifi-text">BTC</span>
          </div>
        </div>
        {inputError && (
          <p className="mt-2 text-sm text-red-600">{inputError}</p>
        )}
      </div>

      {/* Swap arrow */}
      <div className="flex justify-center -my-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-amplifi-border bg-white">
          <img src={LOGOS.swap} alt="" className="h-5 w-5 text-amplifi-text" />
        </div>
      </div>

      {/* To / Receive */}
      <div className="rounded-amplifi bg-white p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <img src={LOGOS.export} alt="output" className="h-5 w-5 text-amplifi-text" />
          <span className="text-base text-amplifi-text">You receive</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1 text-4xl font-medium text-amplifi-amount min-h-[2.25rem] flex items-center">
            {isQuoteLoading ? (
              <span className="text-amplifi-muted">…</span>
            ) : quoteError ? (
              <span className="text-red-600 text-lg">{quoteError}</span>
            ) : quote && amountNum > 0 && !inputError ? (
              <span className="text-amplifi-amount">≈ {quote.output}</span>
            ) : amountNum > 0 && !inputError ? (
              <span className="text-amplifi-muted">≈ —</span>
            ) : (
              <span className="text-amplifi-muted/80">0</span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <img
              src={destAsset?.icon ?? getSwapAssetIcon(dstToken)}
              alt=""
              className="h-8 w-8 rounded-full object-cover"
            />
            <select
              value={dstToken}
              onChange={(e) => setDstToken(e.target.value as DstToken)}
              className="rounded-lg border border-amplifi-border bg-white px-2 py-1.5 text-base font-medium text-amplifi-text focus:outline-none focus:ring-2 focus:ring-amplifi-primary/30"
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

      {!connected && (
        <p className="text-center text-xs text-amplifi-muted">
          Connect both Bitcoin and Starknet wallets to swap
        </p>
      )}
    </div>
  );
}
