import { SwapForm } from "@/components/swap/SwapForm";
import { SwapStatusPanel } from "@/components/swap/SwapStatusPanel";
import { useAtomiqSwap } from "@/hooks/useAtomiqSwap";
import { useConnectModal } from "@/context/ConnectModalContext";

export function SwapPage() {
  const { open } = useConnectModal();
  const {
    isInitialized,
    isInitializing,
    step,
    logs,
    lastSwapId,
    lastOrderId,
    clearLogs,
    runSwap,
    getSwapLimits,
    getQuote,
  } = useAtomiqSwap();

  const handleViewOrder = (orderId: string) => {
    navigate(`/history/${orderId}`);
  };

  return (
    <div className="relative mx-auto w-full max-w-[1400px] min-w-0 py-6 px-4 sm:py-8 sm:px-0">
      <div
        className="pointer-events-none absolute left-0 top-0 bottom-0 w-full max-w-[50%] min-h-[600px] bg-no-repeat bg-left bg-[length:auto_100%] opacity-[0.06] lg:opacity-[0.08]"
        style={{ backgroundImage: "url('/mask.svg')" }}
        aria-hidden
      />
      <div className="relative mb-8 flex flex-col gap-4 sm:mb-10 sm:flex-row sm:gap-20 lg:gap-20">
        <p className="text-2xl font-semibold tracking-tight md:text-3xl">
          Swap
        </p>
        <p className="mt-0 sm:mt-2 text-sm sm:text-base leading-relaxed text-amplifi-text max-w-[899px]">
          Swap BTC to Starknet. Deposit BTC and receive ETH, STRK, or WBTC on
          Starknet Sepolia. Connect both wallets to swap.
        </p>
      </div>
      <div className="relative grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-[472px_1fr]">
        <div className="w-full min-w-0">
          <SwapForm
            isInitialized={isInitialized}
            isInitializing={isInitializing}
            step={step}
            runSwap={runSwap}
            getSwapLimits={getSwapLimits}
            getQuote={getQuote}
            onConnectWallet={open}
          />
        </div>
        <div className="w-full min-w-0">
          <SwapStatusPanel
            step={step}
            logs={logs}
            lastSwapId={lastSwapId}
            lastOrderId={lastOrderId}
            onViewOrder={handleViewOrder}
            clearLogs={clearLogs}
          />
        </div>
      </div>
    </div>
  );
}
