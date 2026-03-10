import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { SupplyBorrowForm } from "@/components/borrow/SupplyBorrowForm";
import { BorrowOffersList } from "@/components/borrow/BorrowOffersList";
import { getLoanOffers, type LoanOfferItem } from "@/lib/amplifi-api";

export function BorrowHomePage() {
  const navigate = useNavigate();
  const [loanParams, setLoanParams] = useState({ borrowUsd: 1000, targetLtv: 0.5 });
  const [offers, setOffers] = useState<LoanOfferItem[]>([]);
  const [offersLoading, setOffersLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const { borrowUsd, targetLtv } = loanParams;
    setOffersLoading(true);
    getLoanOffers({
      collateral: "WBTC",
      borrow: "USDC",
      borrowUsd,
      targetLtv,
      sortBy: "netApy",
      sortOrder: "desc",
      limit: 20,
    })
      .then((res) => {
        if (!cancelled) {
          setOffers(res.data);
        }
      })
      .catch(() => {
        if (!cancelled) setOffers([]);
      })
      .finally(() => {
        if (!cancelled) setOffersLoading(false);
      });
    return () => { cancelled = true; };
  }, [loanParams.borrowUsd, loanParams.targetLtv]);

  const onLoanParamsChange = useCallback((borrowUsd: number, targetLtv: number) => {
    setLoanParams((prev) =>
      prev.borrowUsd === borrowUsd && prev.targetLtv === targetLtv ? prev : { borrowUsd, targetLtv }
    );
  }, []);

  const onGetTheLoan = useCallback(() => {
    const bestOffer = offers[0];
    if (bestOffer) {
      const isBest = true;
      navigate(`/borrow/offer?borrowUsd=${loanParams.borrowUsd}&targetLtv=${loanParams.targetLtv}&offerId=${bestOffer.data.offerId}`, {
        state: { offer: { item: bestOffer, isBest }, offers },
      });
    } else {
      navigate(`/borrow/offer?borrowUsd=${loanParams.borrowUsd}&targetLtv=${loanParams.targetLtv}`);
    }
  }, [navigate, loanParams.borrowUsd, loanParams.targetLtv, offers]);

  const onSelectOffer = useCallback(
    (offer: { item: LoanOfferItem; isBest: boolean } | null) => {
      if (!offer) return;
      const { borrowUsd, targetLtv } = loanParams;
      navigate(
        `/borrow/offer?borrowUsd=${borrowUsd}&targetLtv=${targetLtv}&offerId=${offer.item.data.offerId}`,
        { state: { offer, offers } }
      );
    },
    [navigate, loanParams, offers]
  );

  return (
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
      <div className="relative grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-[472px_1fr]">
        <div className="w-full min-w-0">
          <SupplyBorrowForm
            onLoanParamsChange={onLoanParamsChange}
            selectedOffer={null}
            onGetTheLoan={onGetTheLoan}
          />
        </div>
        <div className="w-full min-w-0">
          <BorrowOffersList
            offers={offers}
            loading={offersLoading}
            borrowUsd={loanParams.borrowUsd}
            targetLtv={loanParams.targetLtv}
            onSelectOffer={onSelectOffer}
          />
        </div>
      </div>
    </div>
  );
}
