import { useState, useEffect, useMemo } from "react";
import Button from "@/components/ui/Button";
import { useDebounce } from "@/hooks/useDebounce";
import { getLoanOffers } from "@/lib/amplifi-api";
import { ASSET_ICONS, LOGOS } from "@/lib/constants";
import { useBtcBalance } from "@/hooks/useBtcBalance";
import type { LoanOfferItem } from "@/lib/amplifi-api";

export interface SupplyBorrowFormProps {
  /** Called when supply amount or LTV changes so the offers list can refetch with the right quote params. */
  onLoanParamsChange?: (borrowUsd: number, targetLtv: number) => void;
  /** When an offer is selected, the form shows "Initiate Loan" state with updated icons. */
  selectedOffer?: { item: LoanOfferItem; isBest: boolean } | null;
  /** Called when user clicks "Initiate Loan" with form values. */
  onInitiateLoan?: (params: {
    btcEquivalent: number;
    supplyAmountUsd: number;
    borrowAmountUsd: number;
  }) => void | Promise<void>;
  /** Error message from initiate loan attempt. */
  initiateError?: string | null;
  /** Starknet address for receiveAddress in bridge order. */
  starknetAddress?: string | null;
  /** When set, loan is in progress - show LTV slider (per design). */
  loanFlow?: { orderId: string } | null;
}

export function SupplyBorrowForm({
  onLoanParamsChange,
  selectedOffer,
  onInitiateLoan,
  initiateError,
  starknetAddress,
  loanFlow,
}: SupplyBorrowFormProps) {
  const [supplyAmount, setSupplyAmount] = useState("20");
  const [ltvPct, setLtvPct] = useState(50);
  const [quoteFromApi, setQuoteFromApi] = useState<{
    requiredCollateralAmount: number;
    borrowUsd: number;
    btcPriceUsd: number;
  } | null>(null);
  const [fallbackBtcPriceUsd, setFallbackBtcPriceUsd] = useState<number | null>(null);
  const { balanceFormatted: btcBalanceDisplay, balanceBtc, isLoading: btcBalanceLoading } = useBtcBalance();

  const ltv = ltvPct / 100;
  const supplyAmountNum = parseFloat(supplyAmount.replace(/,/g, "")) || 0;
  const borrowUsdFromForm = supplyAmountNum * ltv;

  const paramsForApi = useMemo(
    () => ({ supplyAmountNum, ltv }),
    [supplyAmountNum, ltv]
  );
  const debouncedParams = useDebounce(paramsForApi, 350);

  const btcEquivalent = quoteFromApi?.requiredCollateralAmount ?? null;
  const borrowAmountNum = quoteFromApi != null ? quoteFromApi.borrowUsd : borrowUsdFromForm;
  const btcPriceUsd = quoteFromApi?.btcPriceUsd ?? fallbackBtcPriceUsd;
  const isOfferSelected = selectedOffer != null;
  const isLoanInProgress = loanFlow != null;

  useEffect(() => {
    const { supplyAmountNum: s, ltv: l } = debouncedParams;
    if (s <= 0 || l <= 0) {
      setQuoteFromApi(null);
      return;
    }
    const borrowUsd = s * l;
    let cancelled = false;
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
          if (!cancelled) setQuoteFromApi(null);
          return;
        }
        const q = res.data[0].data.quote;
        const amount = q.requiredCollateralAmount;
        if (amount == null || amount <= 0) {
          if (!cancelled) setQuoteFromApi(null);
          return;
        }
        const btcPriceUsd = q.requiredCollateralUsd / amount;
        setQuoteFromApi({
          requiredCollateralAmount: amount,
          borrowUsd: q.borrowUsd,
          btcPriceUsd,
        });
      })
      .catch(() => setQuoteFromApi(null));
    return () => {
      cancelled = true;
    };
  }, [debouncedParams]);

  useEffect(() => {
    const { supplyAmountNum: s, ltv: l } = debouncedParams;
    if (s > 0 && l > 0) {
      onLoanParamsChange?.(s * l, l);
    }
  }, [debouncedParams, onLoanParamsChange]);

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
      setSupplyAmount(usd.toFixed(0));
    }
  };

  const handleInitiateClick = () => {
    if (!isOfferSelected || !onInitiateLoan) return;
    if (btcEquivalent == null || btcEquivalent <= 0) return;
    if (borrowAmountNum <= 0) return;
    onInitiateLoan({
      btcEquivalent,
      supplyAmountUsd: supplyAmountNum,
      borrowAmountUsd: borrowAmountNum,
    });
  };

  return (
    <div className="relative space-y-1.5">
      <div className="rounded-amplifi bg-white p-4 sm:p-6">
        <div className="mb-4 sm:mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2 w-full">

            <img src={LOGOS.import} alt="input" className="h-4 w-4 text-amplifi-text" />
            <div className="flex items-center justify-between w-full">
              <span className="text-base text-amplifi-text">Supply Collateral</span>

              <img src={LOGOS.swap} alt="arrow" className="h-5 w-5 text-amplifi-text" />
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center justify-between gap-2">
          <div className="flex items-center justify-between w-full">
            <input
              type="text"
              value={supplyAmount ? `$${supplyAmount}` : ""}
              onChange={(e) => setSupplyAmount(e.target.value.replace(/^\$/, ""))}
              placeholder="$0"
              className="w-full min-w-0 border-0 bg-transparent p-0 text-4xl font-medium text-amplifi-amount outline-none placeholder:text-amplifi-text-muted focus:ring-0"
              aria-label="Supply amount"
            />
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2">
                <img src={ASSET_ICONS.BTC} alt="" className="h-8 w-8 rounded-full object-cover" />
                <span className="text-base text-amplifi-text">BTC</span>
              </div>
            </div>
          </div>
          <div className="flex w-full items-center justify-between tracking-[-0.32px]">
            <div className="text-base text-amplifi-text text-amplifi-muted">
              {btcEquivalent != null && btcEquivalent > 0
                ? `≈ ${btcEquivalent.toFixed(8)} BTC`
                : "—"}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-base text-amplifi-text text-amplifi-muted">
                {btcBalanceLoading ? "…" : (btcBalanceDisplay ?? "—")}
              </span>
              <button
                type="button"
                onClick={() => setSupplyFromPct(50)}
                className="rounded-[4px] border border-[#E4E4E4] px-2 py-0.5 text-sm text-amplifi-muted"
              >
                50%
              </button>
              <button
                type="button"
                onClick={() => setSupplyFromPct(100)}
                className="rounded-[4px] border border-[#E4E4E4] px-2 py-0.5 text-sm text-amplifi-muted"
              >
                Max
              </button>
            </div>
          </div>
        </div>
        {(!isOfferSelected || isLoanInProgress) && (
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
                <img src={LOGOS.info} alt="info" className="h-5 w-5 text-amplifi-text" />
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
        )}
      </div>

      <div className="rounded-amplifi bg-white p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <img src={LOGOS.export} alt="output" className="h-5 w-5 text-amplifi-text" />
          <span className="text-base text-amplifi-text">Borrow</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="text-4xl font-medium text-amplifi-amount">
            {borrowAmountNum > 0
              ? `$${borrowAmountNum.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
              : <span className="text-amplifi-muted/80">$0</span>}
          </div>
          <div className="flex items-center gap-2">
            <img src={ASSET_ICONS.WBTC} alt="" className="h-8 w-8 rounded-full object-cover" />
            <span className="text-base text-amplifi-text">
              {selectedOffer ? selectedOffer.item.data.borrow.symbol : "WBTC"}
            </span>
            <img src={LOGOS.dropdown} alt="arrow down" className="h-5 w-5 text-amplifi-text" />
          </div>
        </div>
      </div>

      {initiateError && (
        <p className="text-sm text-red-600">{initiateError}</p>
      )}
      <Button
        variant="primary"
        size="lg"
        className="w-full"
        disabled={isOfferSelected && (!starknetAddress || btcEquivalent == null || btcEquivalent <= 0)}
        onClick={isOfferSelected ? handleInitiateClick : undefined}
      >
        {isOfferSelected ? "Initiate Loan" : "Get the Loan"}
      </Button>
    </div>
  );
}
