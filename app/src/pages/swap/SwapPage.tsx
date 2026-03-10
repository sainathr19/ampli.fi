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
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr,minmax(320px,400px)]">
        {/* Left: Swap form */}
        <div className="w-full min-w-0">
          <div className="rounded-amplifi-lg border border-amplifi-border bg-amplifi-surface-muted p-6 sm:p-8">
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
        </div>

        {/* Right: Swap status */}
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
