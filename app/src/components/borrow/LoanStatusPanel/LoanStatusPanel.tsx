import { useEffect, useState } from "react";
import { getOrder, type BridgeOrder } from "@/lib/amplifi-api";
import { LOGOS } from "@/lib/constants";

const POLL_INTERVAL_MS = 3000;

const STEPS = [
  { id: 1, label: "Order Created" },
  { id: 2, label: "Sending BTC" },
  { id: 3, label: "Confirming BTC" },
  { id: 4, label: "Converting to WBTC" },
  { id: 5, label: "Depositing Collateral" },
  { id: 6, label: "Position Active" },
] as const;

/** Maps the frontend swap step to the loan progress step (1-based). */
function swapStepToLoanStep(swapStep: string): number {
  switch (swapStep) {
    case "creating_order":
    case "creating_swap":
      return 1;
    case "sending_btc":
      return 2;
    case "confirming_btc":
      return 3;
    case "claiming":
      return 4;
    case "settled":
      return 4;
    default:
      return 1;
  }
}

/** Maps backend order status to the loan progress step (1-based). */
function statusToStep(status: string): number {
  const s = status?.toUpperCase?.() ?? "";
  if (s === "CREATED" || s === "SWAP_CREATED") return 1;
  if (s === "BTC_SENT") return 3;
  if (s === "BTC_CONFIRMED" || s === "CLAIMING") return 4;
  if (s === "SETTLED") return 4;
  return 1;
}

function depositStepToLoanStep(depositStep: string): number {
  switch (depositStep) {
    case "depositing":
      return 5;
    case "done":
      return 6;
    default:
      return 0;
  }
}

export type DepositPhase = "idle" | "depositing" | "done" | "error";

export interface LoanStatusPanelProps {
  orderId: string;
  isSendingBtc?: boolean;
  /** Frontend swap step from useAtomiqSwap for real-time progress. */
  swapStep?: string;
  /** Vesu collateral deposit phase. */
  depositPhase?: DepositPhase;
}

export function LoanStatusPanel({
  orderId,
  isSendingBtc,
  swapStep,
  depositPhase,
}: LoanStatusPanelProps) {
  const [order, setOrder] = useState<BridgeOrder | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (cancelled || !orderId) return;
      try {
        const res = await getOrder(orderId);
        if (cancelled) return;
        if (res.data) {
          setOrder(res.data);
          setError(res.data.lastError ?? null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to fetch status");
      }
      if (!cancelled)
        timeoutId = setTimeout(poll, POLL_INTERVAL_MS);
    };

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [orderId]);

  // Use frontend swap step for real-time progress; fall back to backend status
  const backendStep = statusToStep(order?.status ?? "CREATED");
  const frontendStep = swapStep ? swapStepToLoanStep(swapStep) : 0;
  const depositStep = depositPhase ? depositStepToLoanStep(depositPhase) : 0;
  const activeStep = Math.max(backendStep, frontendStep, depositStep);

  const isInProgress = isSendingBtc || depositPhase === "depositing";

  return (
    <div className="mb-6">
      <div className="mb-4 flex items-center gap-2 text-base text-amplifi-text">
        <img src={LOGOS.status} alt="status" className="h-5 w-5 text-amplifi-muted" />
        Loan status
      </div>
      <ol className="space-y-3">
        {STEPS.map((step) => {
          const isComplete = step.id < activeStep;
          const isActive = step.id === activeStep;
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
            <li
              key={step.id}
              className="flex items-center gap-3"
            >
              <div
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] text-sm font-semibold ${stepNumberBg} ${stepNumberText}`}
              >
                {step.id}
              </div>
              <span
                className={`text-xl font-medium ${stepNameColor}`}
              >
                {step.label}
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

      {error && (
        <p className="mt-4 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
