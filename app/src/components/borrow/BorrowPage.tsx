import { useState, useCallback, useMemo } from "react";
import { SupplyBorrowForm } from "./SupplyBorrowForm";
import { BorrowOffers, type LoanFlowState } from "./BorrowOffers";
import { type LoanOfferItem } from "@/lib/amplifi-api";
import { useWallet } from "@/store/useWallet";
import { useAtomiqSwap } from "@/hooks/useAtomiqSwap";

export function BorrowPage() {
  const [loanParams, setLoanParams] = useState({
    borrowUsd: 1000,
    targetLtv: 0.5,
  });
  const [selectedOffer, setSelectedOffer] = useState<{
    item: LoanOfferItem;
    isBest: boolean;
  } | null>(null);
  const [initiateError, setInitiateError] = useState<string | null>(null);
  const {
    starknetAddress,
  } = useWallet();

  const {
    step,
    lastOrderId,
    runSwap,
  } = useAtomiqSwap();

  const isSendingBtc = step !== "idle" && step !== "settled" && step !== "error";

  // Derive loanFlow from lastOrderId so the LoanStatusPanel shows progress
  // as soon as the order is created (not after the entire swap completes)
  const loanFlow = useMemo<LoanFlowState | null>(
    () => (lastOrderId ? { orderId: lastOrderId } : null),
    [lastOrderId]
  );

  const onLoanParamsChange = useCallback((borrowUsd: number, targetLtv: number) => {
    setLoanParams((prev) =>
      prev.borrowUsd === borrowUsd && prev.targetLtv === targetLtv
        ? prev
        : { borrowUsd, targetLtv }
    );
  }, []);

  const handleInitiateLoan = useCallback(
    async (params: {
      btcEquivalent: number;
      supplyAmountUsd: number;
      borrowAmountUsd: number;
    }) => {
      if (!selectedOffer) {
        setInitiateError("Select an offer first");
        return;
      }
      setInitiateError(null);

      const btcAmount = params.btcEquivalent;
      if (btcAmount <= 0) {
        setInitiateError("Invalid collateral amount");
        return;
      }

      try {
        const orderId = await runSwap({
          dstToken: "WBTC",
          amountBtc: btcAmount.toFixed(8),
          action: "borrow",
          destinationAsset: "WBTC",
        });

        if (!orderId) {
          setInitiateError("Failed to initiate loan");
        }
      } catch (e) {
        setInitiateError(e instanceof Error ? e.message : "Failed to initiate loan");
      }
    },
    [selectedOffer, runSwap]
  );

  return (
    <div className="relative mx-auto w-full max-w-[1400px] min-w-0 py-6 px-4 sm:py-8 sm:px-0">
      {/* Left-side background pattern */}
      <div
        className="pointer-events-none absolute left-0 top-0 bottom-0 w-full max-w-[50%] min-h-[600px] bg-no-repeat bg-left bg-[length:auto_100%] opacity-[0.06] lg:opacity-[0.08]"
        style={{ backgroundImage: "url('/mask.svg')" }}
        aria-hidden
      />
        <div className="relative mb-8 flex flex-col gap-4 sm:mb-10 sm:flex-row sm:gap-20 lg:gap-20">
          <p className="text-2xl font-semibold tracking-tight md:text-3xl">
            Borrow
          </p>
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
            selectedOffer={selectedOffer}
            onInitiateLoan={handleInitiateLoan}
            initiateError={initiateError}
            starknetAddress={starknetAddress}
            loanFlow={loanFlow}
          />
        </div>
        <div className="w-full min-w-0">
          <BorrowOffers
            borrowUsd={loanParams.borrowUsd}
            targetLtv={loanParams.targetLtv}
            selectedOffer={selectedOffer}
            onSelectOffer={setSelectedOffer}
            loanFlow={loanFlow}
            isSendingBtc={isSendingBtc}
            swapStep={step}
          />
        </div>
      </div>
    </div>
  );
}
