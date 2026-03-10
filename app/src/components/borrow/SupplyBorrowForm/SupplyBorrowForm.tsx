import { useState, useEffect, useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import * as Tooltip from "@radix-ui/react-tooltip";
import Button from "@/components/ui/Button";
import { useDebounce } from "@/hooks/useDebounce";
import { getLoanOffers } from "@/lib/amplifi-api";
import { ASSET_ICONS, LOGOS } from "@/lib/constants";
import { useBtcBalance } from "@/hooks/useBtcBalance";
import { useWalletReadyState } from "@/hooks/useWalletReadyState";
import type { LoanOfferItem } from "@/lib/amplifi-api";

export interface SupplyBorrowFormProps {
  /** Called when supply amount or LTV changes so the offers list can refetch with the right quote params. */
  onLoanParamsChange?: (borrowUsd: number, targetLtv: number) => void;
  /** When an offer is selected, the form shows "Initiate Loan" state with updated icons. */
  selectedOffer?: { item: LoanOfferItem; isBest: boolean } | null;
  /** Called when user clicks "Get the Loan" (no offer selected) - navigates to best offer. */
  onGetTheLoan?: () => void;
  /** Called when user clicks "Initiate Loan" with form values. */
  onInitiateLoan?: (params: {
    btcEquivalent: number;
    supplyAmountUsd: number;
    borrowAmountUsd: number;
  }) => void | Promise<void>;
  /** Error message from initiate loan attempt. */
  initiateError?: string | null;
  /** When set, loan is in progress - show LTV slider (per design). */
  loanFlow?: { orderId: string } | null;
  /** When wallet not connected on offer page, show "Connect Wallet" button. */
  onConnectWallet?: () => void;
  /** Initial supply amount (USD) when navigating to offer page. */
  initialSupplyAmount?: string;
  /** Initial LTV percentage (0-80) when navigating to offer page. */
  initialLtvPct?: number;
  /** Pre-loaded quote from home page (avoids refetch when navigating from home). */
  initialQuote?: {
    requiredCollateralAmount: number;
    borrowUsd: number;
    btcPriceUsd: number;
  } | null;
}

export function SupplyBorrowForm({
  onLoanParamsChange,
  selectedOffer,
  onGetTheLoan,
  onInitiateLoan,
  initiateError,
  loanFlow,
  onConnectWallet,
  initialSupplyAmount,
  initialLtvPct,
  initialQuote,
}: SupplyBorrowFormProps) {
  const [supplyAmount, setSupplyAmount] = useState(initialSupplyAmount ?? "20");
  const [borrowAmount, setBorrowAmount] = useState("");
  const [ltvPct, setLtvPct] = useState(initialLtvPct ?? 50);
  const [isSwapped, setIsSwapped] = useState(false);

  useEffect(() => {
    if (initialSupplyAmount != null) setSupplyAmount(initialSupplyAmount);
  }, [initialSupplyAmount]);
  useEffect(() => {
    if (initialLtvPct != null) setLtvPct(initialLtvPct);
  }, [initialLtvPct]);

  const [quoteFromApi, setQuoteFromApi] = useState<{
    requiredCollateralAmount: number;
    borrowUsd: number;
    btcPriceUsd: number;
  } | null>(initialQuote ?? null);
  // Quote for swapped mode (collateralToBorrow)
  const [swappedQuote, setSwappedQuote] = useState<{
    collateralAmount: number;
    collateralUsd: number;
    maxBorrowUsd: number;
    btcPriceUsd: number;
  } | null>(null);
  const [isQuoteLoading, setIsQuoteLoading] = useState(!initialQuote);
  const [fallbackBtcPriceUsd, setFallbackBtcPriceUsd] = useState<number | null>(null);
  const { balanceFormatted, balanceBtc, isLoading: btcBalanceLoading } = useBtcBalance();
  const { isWalletReadyForSwap, isWalletRestoring } = useWalletReadyState();

  const ltv = ltvPct / 100;
  const supplyAmountNum = parseFloat(supplyAmount.replace(/,/g, "")) || 0;
  const borrowAmountNum_input = parseFloat(borrowAmount.replace(/,/g, "")) || 0;
  const borrowUsdFromForm = supplyAmountNum * ltv;

  // Normal mode params
  const paramsForApi = useMemo(
    () => ({ supplyAmountNum, ltv, isSwapped }),
    [supplyAmountNum, ltv, isSwapped]
  );
  const debouncedParams = useDebounce(paramsForApi, 350);

  // Swapped mode params
  const swappedParamsForApi = useMemo(
    () => ({ borrowAmountNum_input, ltv, isSwapped }),
    [borrowAmountNum_input, ltv, isSwapped]
  );
  const debouncedSwappedParams = useDebounce(swappedParamsForApi, 350);

  // Derived values based on mode
  const btcEquivalent = isSwapped
    ? (swappedQuote ? swappedQuote.collateralAmount : null)
    : (quoteFromApi?.requiredCollateralAmount ?? null);
  const borrowAmountNum = isSwapped
    ? borrowAmountNum_input
    : (quoteFromApi != null ? quoteFromApi.borrowUsd : borrowUsdFromForm);
  const computedSupplyUsd = isSwapped
    ? (swappedQuote ? swappedQuote.collateralUsd : (borrowAmountNum_input > 0 && ltv > 0 ? borrowAmountNum_input / ltv : 0))
    : supplyAmountNum;
  const btcPriceUsd = (isSwapped ? swappedQuote?.btcPriceUsd : quoteFromApi?.btcPriceUsd) ?? fallbackBtcPriceUsd;
  const isOfferSelected = selectedOffer != null;
  const isLoanInProgress = loanFlow != null;

  // Normal mode: fetch quote from supply amount
  useEffect(() => {
    if (isSwapped) return;
    const { supplyAmountNum: s, ltv: l } = debouncedParams;
    if (s <= 0 || l <= 0) {
      setQuoteFromApi(null);
      setIsQuoteLoading(false);
      return;
    }
    if (initialQuote && Math.abs(s * l - initialQuote.borrowUsd) < 1) {
      setQuoteFromApi(initialQuote);
      setIsQuoteLoading(false);
      return;
    }
    const borrowUsd = s * l;
    let cancelled = false;
    setIsQuoteLoading(true);
    getLoanOffers({
      collateral: "WBTC",
      borrow: "USDC",
      borrowUsd,
      targetLtv: l,
      sortBy: "netApy",
      sortOrder: "desc",
      limit: 1,
    })
      .then((res) => {
        if (cancelled || !res.data[0]?.data?.quote) {
          if (!cancelled) {
            setQuoteFromApi(null);
            setIsQuoteLoading(false);
          }
          return;
        }
        const q = res.data[0].data.quote;
        const amount = q.requiredCollateralAmount;
        if (amount == null || amount <= 0) {
          if (!cancelled) {
            setQuoteFromApi(null);
            setIsQuoteLoading(false);
          }
          return;
        }
        const btcPriceUsd = q.requiredCollateralUsd / amount;
        if (!cancelled) {
          setQuoteFromApi({
            requiredCollateralAmount: amount,
            borrowUsd: q.borrowUsd,
            btcPriceUsd,
          });
          setIsQuoteLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQuoteFromApi(null);
          setIsQuoteLoading(false);
        }
      });
    return () => {
      cancelled = true;
      setIsQuoteLoading(false);
    };
  }, [debouncedParams, initialQuote, isSwapped]);

  // Swapped mode: user types borrow USD → compute collateral needed via borrowToCollateral
  useEffect(() => {
    if (!isSwapped) return;
    const { borrowAmountNum_input: b, ltv: l } = debouncedSwappedParams;
    if (b <= 0 || l <= 0) {
      setSwappedQuote(null);
      setIsQuoteLoading(false);
      return;
    }
    let cancelled = false;
    setIsQuoteLoading(true);
    getLoanOffers({
      collateral: "WBTC",
      borrow: "USDC",
      borrowUsd: b,
      targetLtv: l,
      sortBy: "netApy",
      sortOrder: "desc",
      limit: 1,
    })
      .then((res) => {
        if (cancelled || !res.data[0]?.data?.quote) {
          if (!cancelled) {
            setSwappedQuote(null);
            setIsQuoteLoading(false);
          }
          return;
        }
        const q = res.data[0].data.quote;
        const amount = q.requiredCollateralAmount;
        if (amount == null || amount <= 0) {
          if (!cancelled) {
            setSwappedQuote(null);
            setIsQuoteLoading(false);
          }
          return;
        }
        const price = q.requiredCollateralUsd / amount;
        if (!cancelled) {
          setSwappedQuote({
            collateralAmount: amount,
            collateralUsd: q.requiredCollateralUsd,
            maxBorrowUsd: q.borrowUsd,
            btcPriceUsd: price,
          });
          setIsQuoteLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSwappedQuote(null);
          setIsQuoteLoading(false);
        }
      });
    return () => {
      cancelled = true;
      setIsQuoteLoading(false);
    };
  }, [debouncedSwappedParams, isSwapped]);

  useEffect(() => {
    if (isSwapped) {
      const { borrowAmountNum_input: b, ltv: l } = debouncedSwappedParams;
      if (b > 0 && l > 0) {
        onLoanParamsChange?.(b, l);
      }
    } else {
      const { supplyAmountNum: s, ltv: l } = debouncedParams;
      if (s > 0 && l > 0) {
        onLoanParamsChange?.(s * l, l);
      }
    }
  }, [debouncedParams, debouncedSwappedParams, onLoanParamsChange, isSwapped]);

  useEffect(() => {
    if (fallbackBtcPriceUsd != null) return;
    let cancelled = false;
    getLoanOffers({
      collateral: "WBTC",
      borrow: "USDC",
      borrowUsd: 200,
      targetLtv: 0.5,
      limit: 1,
    })
      .then((res) => {
        if (cancelled || !res.data[0]?.data?.quote) return;
        const q = res.data[0].data.quote;
        const amount = q.requiredCollateralAmount;
        if (amount != null && amount > 0) setFallbackBtcPriceUsd(q.requiredCollateralUsd / amount);
      })
      .catch(() => { });
    return () => {
      cancelled = true;
    };
  }, [fallbackBtcPriceUsd]);

  const setSupplyFromPct = (pct: number) => {
    if (balanceBtc > 0 && btcPriceUsd != null && btcPriceUsd > 0) {
      const usd = (balanceBtc * btcPriceUsd * pct) / 100;
      if (isSwapped) {
        setBorrowAmount((usd * ltv).toFixed(0));
      } else {
        setSupplyAmount(usd.toFixed(0));
      }
    }
  };

  const handleSwap = () => {
    if (isSwapped) {
      // Swapped → Normal: seed supply from computed collateral USD
      const computedUsd = swappedQuote ? swappedQuote.collateralUsd : (borrowAmountNum_input > 0 && ltv > 0 ? borrowAmountNum_input / ltv : 0);
      if (computedUsd > 0) {
        setSupplyAmount(Math.round(computedUsd).toString());
      }
    } else {
      // Normal → Swapped: seed borrow from computed borrow USD
      if (borrowAmountNum > 0) {
        setBorrowAmount(Math.round(borrowAmountNum).toString());
      }
    }
    setIsSwapped((prev) => !prev);
  };

  const [isInitiating, setIsInitiating] = useState(false);

  const effectiveSupplyUsd = isSwapped ? computedSupplyUsd : supplyAmountNum;
  const effectiveBtcEquivalent = btcEquivalent;

  const handleInitiateClick = async () => {
    if (!isOfferSelected || !onInitiateLoan) return;
    if (effectiveBtcEquivalent == null || effectiveBtcEquivalent <= 0) return;
    if (borrowAmountNum <= 0) return;
    setIsInitiating(true);
    try {
      await onInitiateLoan({
        btcEquivalent: effectiveBtcEquivalent,
        supplyAmountUsd: effectiveSupplyUsd,
        borrowAmountUsd: borrowAmountNum,
      });
    } finally {
      setIsInitiating(false);
    }
  };

  // --- Render sections ---

  const supplySection = (
    <div className="rounded-amplifi bg-white p-4 sm:p-6">
      <div className="mb-4 sm:mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2 w-full">
          <img src={LOGOS.import} alt="input" className="h-4 w-4 text-amplifi-text" />
          <div className="flex items-center justify-between w-full">
            <span className="text-base text-amplifi-text">Supply Collateral</span>
            {!isOfferSelected && (
              <img
                src={LOGOS.swap}
                alt="swap"
                className="h-5 w-5 text-amplifi-text cursor-pointer"
                onClick={handleSwap}
              />
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-col items-center justify-between gap-2">
        <div className="flex items-center justify-between w-full">
          {isSwapped && !isOfferSelected ? (
            // Swapped: supply is computed (read-only)
            <div className="w-full min-w-0 border-0 bg-transparent p-0 text-4xl font-medium text-amplifi-amount min-h-[2.25rem] flex items-center">
              {isQuoteLoading ? (
                <span className="inline-block h-9 w-24 skeleton-shimmer rounded align-middle" aria-label="Loading supply amount" />
              ) : computedSupplyUsd > 0 ? (
                `$${Math.round(computedSupplyUsd).toLocaleString("en-US")}`
              ) : (
                <span className="text-amplifi-muted/80">$0</span>
              )}
            </div>
          ) : isOfferSelected ? (
            // Offer selected: read-only confirmation display
            <div className="w-full min-w-0 border-0 bg-transparent p-0 text-4xl font-medium text-amplifi-amount min-h-[2.25rem] flex items-center">
              {supplyAmount ? `$${supplyAmount}` : "$0"}
            </div>
          ) : (
            // Normal: supply is editable
            <input
              type="text"
              value={supplyAmount ? `$${supplyAmount}` : ""}
              onChange={(e) => setSupplyAmount(e.target.value.replace(/^\$/, ""))}
              placeholder="$0"
              className="w-full min-w-0 border-0 bg-transparent p-0 text-4xl font-medium text-amplifi-amount outline-none placeholder:text-amplifi-text-muted focus:ring-0"
              aria-label="Supply amount"
            />
          )}
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
              <img src={ASSET_ICONS.BTC} alt="" className="h-8 w-8 rounded-full object-cover" />
              <span className="text-base text-amplifi-text">BTC</span>
            </div>
          </div>
        </div>
        <div className="flex w-full items-center justify-between tracking-[-0.32px]">
          <div className="text-base text-amplifi-text text-amplifi-muted min-w-[140px]">
            {isQuoteLoading ? (
              <span className="inline-block h-4 w-24 skeleton-shimmer rounded align-middle" aria-label="Loading BTC equivalent" />
            ) : btcEquivalent != null && btcEquivalent > 0 ? (
              `≈ ${btcEquivalent.toFixed(8)} BTC`
            ) : (
              "—"
            )}
          </div>
          {!isSwapped && !isOfferSelected && balanceFormatted != null && balanceBtc > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-base text-amplifi-text text-amplifi-muted">
                {btcBalanceLoading ? "…" : balanceFormatted}
              </span>
              <button
                type="button"
                onClick={() => setSupplyFromPct(50)}
                className="cursor-pointer rounded-[4px] border border-[#E4E4E4] px-2 py-0.5 text-sm text-amplifi-muted transition-colors hover:border-amplifi-primary hover:text-amplifi-primary active:bg-amplifi-primary/10"
              >
                50%
              </button>
              <button
                type="button"
                onClick={() => setSupplyFromPct(100)}
                className="cursor-pointer rounded-[4px] border border-[#E4E4E4] px-2 py-0.5 text-sm text-amplifi-muted transition-colors hover:border-amplifi-primary hover:text-amplifi-primary active:bg-amplifi-primary/10"
              >
                Max
              </button>
            </div>
          )}
        </div>
      </div>
      <AnimatePresence>
        {(!isOfferSelected || isLoanInProgress) && (
          <motion.div
            key="ltv-bar"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between text-base text-amplifi-text">
                <span>Loan-to-value (%)</span>
                <div className="flex items-center gap-1.5">
                  {ltvPct <= 50 && (
                    <span className="rounded-[4px] text-amplifi-risk-safe bg-amplifi-risk-safe-bg/50 px-1.5 py-0.5 text-sm font-normal tracking-[-0.28px]">
                      Low risk!
                    </span>
                  )}
                  {ltvPct > 50 && ltvPct <= 65 && (
                    <span className="rounded-[4px] text-amplifi-risk-medium bg-amplifi-risk-medium-bg/50 px-1.5 py-0.5 text-sm font-normal tracking-[-0.28px]">
                      Med risk
                    </span>
                  )}
                  {ltvPct > 65 && (
                    <span className="rounded-[4px] text-amplifi-risk-hard bg-amplifi-risk-hard-bg/50 px-1.5 py-0.5 text-sm font-normal tracking-[-0.28px]">
                      High risk
                    </span>
                  )}
                  <Tooltip.Root>
                    <Tooltip.Trigger asChild>
                      <img src={LOGOS.info} alt="info" className="h-5 w-5 text-amplifi-text cursor-help" />
                    </Tooltip.Trigger>
                    <Tooltip.Portal>
                      <Tooltip.Content
                        side="top"
                        align="end"
                        sideOffset={6}
                        className="z-50 max-w-[240px] rounded-lg bg-[#1a1a1a] px-3 py-2.5 text-xs leading-relaxed text-white shadow-lg"
                      >
                        {ltvPct <= 50 && (
                          <p><span className="font-medium text-[#00CD3B]">Low risk</span> — Safe buffer from liquidation. Your collateral can absorb significant price drops.</p>
                        )}
                        {ltvPct > 50 && ltvPct <= 65 && (
                          <p><span className="font-medium text-[#D08700]">Med risk</span> — Moderate buffer. A sharp price drop could approach your liquidation threshold.</p>
                        )}
                        {ltvPct > 65 && (
                          <p><span className="font-medium text-[#DC2626]">High risk</span> — Thin margin before liquidation. Small price movements could trigger liquidation.</p>
                        )}
                        <Tooltip.Arrow className="fill-[#1a1a1a]" />
                      </Tooltip.Content>
                    </Tooltip.Portal>
                  </Tooltip.Root>
                </div>
              </div>
              {/* Custom LTV slider: 0-50 safe (green), 51-65 med (yellow), 66-80 high (red) */}
              <div className="relative h-8 w-full">
                {/* Filled track (left of thumb): solid color based on current risk level */}
                <div
                  className="pointer-events-none absolute top-1/2 h-1 -translate-y-1/2 rounded-l-full"
                  style={{
                    width: `${(ltvPct / 80) * 100}%`,
                    background:
                      ltvPct <= 50
                        ? "#00CD3B"
                        : ltvPct <= 65
                          ? "#D08700"
                          : "#DC2626",
                  }}
                />
                {/* Unfilled track (right of thumb): gradient at 50% opacity */}
                <div
                  className="pointer-events-none absolute top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-r-full opacity-50"
                  style={{
                    left: `${(ltvPct / 80) * 100}%`,
                    width: `${((80 - ltvPct) / 80) * 100}%`,
                  }}
                >
                  <div
                    className="h-full"
                    style={{
                      width: `${(80 / (80 - ltvPct || 1)) * 100}%`,
                      marginLeft: `${-(ltvPct / (80 - ltvPct || 1)) * 100}%`,
                      background:
                        "linear-gradient(to right, #00CD3B 0%, #00CD3B 62.5%, #D08700 62.5%, #D08700 81.25%, #DC2626 81.25%, #DC2626 100%)",
                    }}
                  />
                </div>
                {/* Thumb - pointer-events-none so range input receives clicks */}
                <div
                  className="pointer-events-none absolute top-1/2 z-10 flex -translate-y-1/2 items-center justify-center rounded-[10px] border border-[#8A8A8A] bg-white font-semibold text-amplifi-text"
                  style={{
                    width: 48,
                    height: 32,
                    left: `clamp(0px, calc(${(ltvPct / 80) * 100}% - 24px), calc(100% - 48px))`,
                  }}
                >
                  {ltvPct}%
                </div>
                {/* Invisible range input for interaction */}
                <input
                  type="range"
                  min="0"
                  max="80"
                  value={ltvPct}
                  onChange={(e) => setLtvPct(Number(e.target.value))}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  aria-label="Loan-to-value percentage"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  const borrowSection = (
    <div className="rounded-amplifi bg-white p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <img src={LOGOS.export} alt="output" className="h-5 w-5 text-amplifi-text" />
        <span className="text-base text-amplifi-text">Borrow</span>
      </div>
      <div className="flex items-center justify-between gap-4">
        {isSwapped && !isOfferSelected ? (
          // Swapped: borrow is editable
          <input
            type="text"
            value={borrowAmount ? `$${borrowAmount}` : ""}
            onChange={(e) => setBorrowAmount(e.target.value.replace(/^\$/, ""))}
            placeholder="$0"
            className="w-full min-w-0 border-0 bg-transparent p-0 text-4xl font-medium text-amplifi-amount outline-none placeholder:text-amplifi-text-muted focus:ring-0"
            aria-label="Borrow amount"
          />
        ) : (
          // Normal or offer selected: borrow is read-only
          <div className="min-w-0 flex-1 text-4xl font-medium text-amplifi-amount min-h-[2.25rem] flex items-center">
            {isQuoteLoading ? (
              <span className="inline-block h-9 w-20 skeleton-shimmer rounded align-middle" aria-label="Loading borrow amount" />
            ) : borrowAmountNum > 0 ? (
              `$${borrowAmountNum.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
            ) : (
              <span className="text-amplifi-muted/80">$0</span>
            )}
          </div>
        )}
        <div className="flex shrink-0 items-center gap-2">
          <img src={ASSET_ICONS.WBTC} alt="" className="h-8 w-8 rounded-full object-cover" />
          <span className="text-base text-amplifi-text">
            {selectedOffer ? selectedOffer.item.data.borrow.symbol : "WBTC"}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative space-y-1.5">
      {isSwapped ? (
        <>
          {borrowSection}
          {supplySection}
        </>
      ) : (
        <>
          {supplySection}
          {borrowSection}
        </>
      )}

      {initiateError && (
        <p className="text-sm text-red-600">{initiateError}</p>
      )}
      <Button
        variant="primary"
        size="lg"
        className="w-full"
        disabled={
          isInitiating ||
          isQuoteLoading ||
          (isOfferSelected &&
            isWalletReadyForSwap &&
            (effectiveBtcEquivalent == null || effectiveBtcEquivalent <= 0))
        }
        onClick={
          isOfferSelected
            ? isWalletReadyForSwap
              ? handleInitiateClick
              : onConnectWallet
            : onGetTheLoan
        }
      >
        {isInitiating
          ? "Initiating…"
          : isWalletRestoring && isOfferSelected
            ? "Reconnecting wallets…"
            : isQuoteLoading
              ? "Getting quote…"
              : isOfferSelected && !isWalletReadyForSwap && onConnectWallet
                ? "Connect Wallet"
                : isOfferSelected
                  ? "Initiate Loan"
                  : "Get the Loan"}
      </Button>
    </div>
  );
}
