import { LOGOS } from "@/lib/constants";
import type { SwapStep } from "@/hooks/useAtomiqSwap";

const SWAP_STEPS: { id: SwapStep; label: string }[] = [
  { id: "creating_order", label: "Creating order" },
  { id: "creating_swap", label: "Creating swap" },
  { id: "sending_btc", label: "Sending BTC" },
  { id: "confirming_btc", label: "Confirming BTC" },
  { id: "claiming", label: "Claiming on Starknet" },
  { id: "settled", label: "Complete" },
];

function stepToIndex(step: SwapStep): number {
  const idx = SWAP_STEPS.findIndex((s) => s.id === step);
  if (idx >= 0) return idx;
  if (step === "idle") return -1;
  if (step === "error") return -2;
  return -1;
}

export interface SwapStatusPanelProps {
  step: SwapStep;
  logs: string[];
  lastSwapId: string | null;
  lastOrderId: string | null;
  onViewOrder?: (orderId: string) => void;
  clearLogs?: () => void;
}

export function SwapStatusPanel({
  step,
  logs,
  lastSwapId,
  lastOrderId,
  onViewOrder,
  clearLogs,
}: SwapStatusPanelProps) {
  const activeIndex = stepToIndex(step);
  const isError = step === "error";
  const isInProgress =
    step !== "idle" && step !== "settled" && step !== "error";

  return (
    <div className="rounded-amplifi-lg border border-amplifi-border bg-amplifi-surface p-4 sm:p-5 md:p-6 shadow-amplifi lg:sticky lg:top-4 lg:self-start">
      <div className="mb-4 flex items-center gap-2 text-base text-amplifi-text">
        <img src={LOGOS.status} alt="status" className="h-5 w-5 text-amplifi-muted" />
        Swap status
      </div>

      {activeIndex < 0 && !isInProgress && !isError && (
        <p className="text-sm text-amplifi-muted">
          Enter amount and destination, then click Swap to start.
        </p>
      )}

      {isInProgress && (
        <ol className="space-y-3">
          {SWAP_STEPS.map((s, idx) => {
            const isComplete = idx < activeIndex || step === "settled";
            const isActive = idx === activeIndex;
            const showLoading = isActive && isInProgress;

            const stepNumberBg = isComplete
              ? "bg-[#F3FDF6]"
              : isActive
                ? "bg-[#00CD3B]"
                : "bg-[#FAFAFA]";
            const stepNumberText = isActive
              ? "text-white"
              : isComplete
                ? "text-[#033122]"
                : "text-[#8A8A8A]";
            const stepNameColor = isActive ? "text-[#033122]" : "text-[#8A8A8A]";

            return (
              <li key={s.id} className="flex items-center gap-3">
                <div
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] text-sm font-semibold ${stepNumberBg} ${stepNumberText}`}
                >
                  {idx + 1}
                </div>
                <span className={`text-xl font-medium ${stepNameColor}`}>
                  {s.label}
                </span>
                {showLoading && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#00CD3B]">
                    <img
                      src={LOGOS.loading}
                      alt=""
                      className="h-8 w-8 animate-spin"
                      aria-hidden
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {step === "settled" && (
        <div className="space-y-3">
          <p className="text-base font-medium text-[#00CD3B]">Swap complete!</p>
          {lastOrderId && onViewOrder && (
            <button
              type="button"
              onClick={() => onViewOrder(lastOrderId)}
              className="text-sm text-amplifi-primary hover:underline"
            >
              View order details →
            </button>
          )}
        </div>
      )}

      {isError && (
        <p className="text-sm text-red-600">
          Swap failed. Check the transaction logs below.
        </p>
      )}

      {lastSwapId && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-amplifi-border bg-amplifi-surface-muted p-3">
          <span className="text-xs font-medium text-amplifi-text">Swap ID:</span>
          <span className="font-mono break-all text-xs text-amplifi-text">
            {lastSwapId}
          </span>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(lastSwapId)}
            className="rounded-lg bg-amplifi-primary px-2 py-1 text-xs font-medium text-white"
          >
            Copy
          </button>
        </div>
      )}

      {logs.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-amplifi-text">
              Transaction logs
            </span>
            {clearLogs && (
              <button
                type="button"
                onClick={clearLogs}
                className="text-xs text-amplifi-primary hover:underline"
              >
                Clear
              </button>
            )}
          </div>
          <div className="max-h-48 space-y-1 overflow-auto rounded-lg border border-amplifi-border bg-white px-3 py-2 text-xs font-mono text-amplifi-text">
            {logs.map((line, i) => (
              <div key={i} className="leading-relaxed">
                {line}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
