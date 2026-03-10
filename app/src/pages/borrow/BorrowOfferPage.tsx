import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { SupplyBorrowForm } from "@/components/borrow/SupplyBorrowForm";
import { BorrowOfferDetail } from "@/components/borrow/BorrowOfferDetail";
import { SupplyBorrowFormSkeleton, BorrowOfferDetailSkeleton } from "@/components/skeletons";
import { useBorrowSwap } from "@/context/BorrowSwapContext";
import { useConnectModal } from "@/context/ConnectModalContext";
import { getLoanOffers, type LoanOfferItem } from "@/lib/amplifi-api";

type OfferState = { offer: { item: LoanOfferItem; isBest: boolean }; offers?: LoanOfferItem[] } | null;

export function BorrowOfferPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { runSwap, step, lastOrderId } = useBorrowSwap();
  const { open: openConnectModal } = useConnectModal();

  const borrowUsd = Number(searchParams.get("borrowUsd")) || 1000;
  const targetLtv = Number(searchParams.get("targetLtv")) || 0.5;
  const offerIdParam = searchParams.get("offerId");
  const locationState = location.state as OfferState | undefined;

  const [offer, setOffer] = useState<{ item: LoanOfferItem; isBest: boolean } | null>(
    () => locationState?.offer ?? null
  );
  const [loading, setLoading] = useState(!locationState?.offer);
  const [initiateError, setInitiateError] = useState<string | null>(null);

  useEffect(() => {
    if (locationState?.offer) return;
    let cancelled = false;
    getLoanOffers({
      collateral: "WBTC",
      borrow: "USDC",
      borrowUsd,
      targetLtv,
      sortBy: "netApy",
      sortOrder: "desc",
      limit: offerIdParam ? 20 : 1,
    })
      .then((res) => {
        if (cancelled) return;
        const items = res.data;
        const found = offerIdParam
          ? items.find((i) => i.data.offerId === offerIdParam)
          : items[0];
        if (found) {
          const isBest = items[0]?.data.offerId === found.data.offerId;
          setOffer({ item: found, isBest });
        } else {
          setOffer(null);
        }
      })
      .catch(() => {
        if (!cancelled) setOffer(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [borrowUsd, targetLtv, offerIdParam, locationState?.offer]);

  const onLoanParamsChange = useCallback(() => { }, []);

  const handleInitiateLoan = useCallback(
    async (params: {
      btcEquivalent: number;
      supplyAmountUsd: number;
      borrowAmountUsd: number;
    }) => {
      if (!offer) {
        setInitiateError("Select an offer first");
        return;
      }
      setInitiateError(null);

      const btcAmount = params.btcEquivalent;
      if (btcAmount <= 0) {
        setInitiateError("Invalid collateral amount");
        return;
      }

      const vTokenAddress = offer.item.data.collateral.vTokenAddress;
      const quote = offer.item.data.quote;
      const decimals = offer.item.data.collateral.decimals ?? 8;

      let depositParams: { vTokenAddress: string; collateralAmount: string; decimals: number } | undefined;
      if (vTokenAddress) {
        const collateralAmount = quote?.requiredCollateralAmount;
        if (collateralAmount != null && collateralAmount > 0) {
          depositParams = {
            vTokenAddress,
            collateralAmount: BigInt(
              Math.floor(collateralAmount * 10 ** decimals)
            ).toString(),
            decimals,
          };
        } else {
          depositParams = {
            vTokenAddress,
            collateralAmount: BigInt(
              Math.floor(btcAmount * 10 ** decimals)
            ).toString(),
            decimals,
          };
        }
      }

      try {
        const orderId = await runSwap({
          dstToken: "WBTC",
          amountBtc: btcAmount.toFixed(8),
          action: "borrow",
          destinationAsset: "WBTC",
          depositParams,
          onOrderCreated: (id) =>
            navigate(`/borrow/order/${id}`, {
              state: {
                supplyAmountUsd: params.supplyAmountUsd,
                borrowAmountUsd: params.borrowAmountUsd,
                btcEquivalent: params.btcEquivalent,
                ltvPct: Math.round((params.borrowAmountUsd / params.supplyAmountUsd) * 100),
                borrowSymbol: offer?.item?.data?.borrow?.symbol ?? "USDC",
              },
            }),
        });

        if (!orderId) {
          setInitiateError("Failed to initiate loan");
        }
      } catch (e) {
        setInitiateError(e instanceof Error ? e.message : "Failed to initiate loan");
      }
    },
    [offer, runSwap, navigate]
  );

  const loanFlow = lastOrderId ? { orderId: lastOrderId } : null;
  const isSendingBtc = step !== "idle" && step !== "settled" && step !== "error";

  const supplyAmountUsd = borrowUsd / targetLtv;
  const initialSupplyAmount = String(Math.round(supplyAmountUsd));
  const initialLtvPct = Math.round(targetLtv * 100);

  const initialQuote = offer?.item?.data?.quote
    ? (() => {
      const q = offer.item.data.quote;
      const amount = q.requiredCollateralAmount;
      if (amount == null || amount <= 0) return null;
      return {
        requiredCollateralAmount: amount,
        borrowUsd: q.borrowUsd,
        btcPriceUsd: q.requiredCollateralUsd / amount,
      };
    })()
    : null;

  const layout = (content: React.ReactNode) => (
    <div className="relative mx-auto w-full max-w-[1400px] min-w-0 py-6 px-4 sm:py-8 sm:px-0">
      <div
        className="pointer-events-none absolute left-0 top-0 bottom-0 w-full max-w-[50%] min-h-[600px] bg-no-repeat bg-left bg-[length:auto_100%] opacity-[0.06] lg:opacity-[0.08]"
        style={{ backgroundImage: "url('/mask.svg')" }}
        aria-hidden
      />
      <div className="relative mb-8 flex flex-col gap-4 sm:mb-10 sm:flex-row sm:gap-20 lg:gap-20">
        <p className="text-2xl font-semibold tracking-tight md:text-3xl">Borrow</p>
        <p className="mt-0 sm:mt-2 text-sm sm:text-base leading-relaxed text-amplifi-text max-w-[899px]">
          Borrow against your BTC. Deposit BTC, and we automatically swap and
          route it into the required collateral pool. Receive your loan
          instantly. Repay anytime to unlock and withdraw your BTC.
        </p>
      </div>
      {content}
    </div>
  );

  if (loading) {
    return layout(
      <div className="relative grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-[472px_1fr]">
        <div className="w-full min-w-0">
          <SupplyBorrowFormSkeleton />
        </div>
        <div className="w-full min-w-0">
          <BorrowOfferDetailSkeleton />
        </div>
      </div>
    );
  }

  if (!offer) {
    return layout(
      <>
        <p className="text-sm text-amplifi-muted">Offer not found.</p>
        <button
          type="button"
          onClick={() => navigate("/borrow")}
          className="mt-4 text-sm text-amplifi-primary hover:underline"
        >
          Back to offers
        </button>
      </>
    );
  }

  return layout(
    <div className="relative grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-[472px_1fr]">
      <div className="w-full min-w-0">
        <SupplyBorrowForm
          onLoanParamsChange={onLoanParamsChange}
          selectedOffer={offer}
          onInitiateLoan={handleInitiateLoan}
          initiateError={initiateError}
          loanFlow={loanFlow}
          onConnectWallet={openConnectModal}
          initialSupplyAmount={initialSupplyAmount}
          initialLtvPct={initialLtvPct}
          initialQuote={initialQuote}
        />
      </div>
      <div className="w-full min-w-0">
        <BorrowOfferDetail
          offer={offer}
          loanFlow={loanFlow}
          isSendingBtc={isSendingBtc}
          swapStep={step}
          onBack={() => navigate("/borrow")}
        />
      </div>
    </div>
  );
}
