import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "@/store/useWallet";
import { useConnectModal } from "@/context/ConnectModalContext";
import { getOrders, type BridgeOrder } from "@/lib/amplifi-api";
import { ASSET_ICONS, LOGOS } from "@/lib/constants";
import { HistoryListSkeleton } from "@/components/skeletons";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function satsToBtc(sats: string): string {
  const n = Number(sats) / 1e8;
  return n.toFixed(8);
}

function statusBadge(status: string): { label: string; className: string } {
  const s = status?.toUpperCase?.() ?? "";
  switch (s) {
    case "SETTLED":
      return { label: "Completed", className: "bg-[#F3FDF6] text-[#033122]" };
    case "FAILED":
    case "EXPIRED":
    case "REFUNDED":
      return { label: s.replace("_", " "), className: "bg-red-50 text-red-700" };
    case "CREATED":
    case "SWAP_CREATED":
      return { label: "Pending", className: "bg-amber-50 text-amber-800" };
    case "BTC_SENT":
    case "BTC_CONFIRMED":
    case "CLAIMING":
      return { label: "In Progress", className: "bg-blue-50 text-blue-700" };
    default:
      return { label: status, className: "bg-gray-100 text-gray-700" };
  }
}

export function HistoryPage() {
  const navigate = useNavigate();
  const { starknetAddress, connected } = useWallet();
  const { open: openConnectModal } = useConnectModal();
  const [orders, setOrders] = useState<BridgeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<{ total: number; totalPages: number; hasNextPage: boolean; hasPrevPage: boolean } | null>(null);

  useEffect(() => {
    if (!starknetAddress) {
      setOrders([]);
      setLoading(false);
      setMeta(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getOrders({ walletAddress: starknetAddress, page, limit: 20 })
      .then((res) => {
        if (!cancelled) {
          setOrders(res.data);
          setMeta(res.meta);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load history");
          setOrders([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [starknetAddress, page]);

  if (!connected) {
    return (
      <div className="relative mx-auto w-full max-w-[1400px] min-w-0 py-6 px-4 sm:py-8 sm:px-0">
        <div className="rounded-amplifi-lg bg-white p-8 text-center">
          <p className="mb-4 text-base text-amplifi-text">Connect your wallet to view loan history.</p>
          <button
            type="button"
            onClick={openConnectModal}
            className="rounded-[10px] bg-amplifi-nav px-6 py-3 text-sm font-medium text-white hover:opacity-90"
          >
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative mx-auto w-full max-w-[1400px] min-w-0 py-6 px-4 sm:py-8 sm:px-0">
      <div className="relative mb-8 flex flex-col gap-4 sm:mb-10 sm:flex-row sm:gap-20 lg:gap-20">
        <p className="text-2xl font-semibold tracking-tight md:text-3xl">History</p>
        <p className="mt-0 sm:mt-2 text-sm sm:text-base leading-relaxed text-amplifi-text max-w-[899px]">
          View your loan and swap history. Click any order for full details.
        </p>
      </div>


      {loading ? (
        <HistoryListSkeleton />
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : orders.length === 0 ? (
        <p className="text-sm text-amplifi-muted">No orders yet.</p>
      ) : (
        <div className="rounded-amplifi-lg bg-white p-4 sm:p-5 md:p-6">
          <p className="mb-4 flex items-center gap-2 text-base text-amplifi-text">
            <img src={LOGOS.borrow} alt="history" className="h-5 w-5" />
            Orders
          </p>
          <ul className="space-y-0">
            {orders.map((order) => {
              const badge = statusBadge(order.status);
              const amountBtc = order.amountSource
                ? satsToBtc(order.amountSource)
                : satsToBtc(order.amount);
              return (
                <li
                  key={order.id}
                  role="button"
                  tabIndex={0}
                  className="flex flex-col gap-4 border-b border-amplifi-border py-5 last:border-b-0 cursor-pointer hover:bg-gray-50/50 transition-colors"
                  onClick={() => navigate(`/history/${order.id}`)}
                  onKeyDown={(e) => e.key === "Enter" && navigate(`/history/${order.id}`)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="flex items-center gap-2 shrink-0">
                        <img
                          src={ASSET_ICONS[order.sourceAsset as keyof typeof ASSET_ICONS] ?? ASSET_ICONS.BTC}
                          alt=""
                          className="h-6 w-6 rounded-full"
                        />
                        <span className="text-sm font-medium text-amplifi-text">
                          {amountBtc} {order.sourceAsset}
                        </span>
                        <span className="text-amplifi-muted">→</span>
                        <img
                          src={ASSET_ICONS[order.destinationAsset as keyof typeof ASSET_ICONS] ?? ASSET_ICONS.WBTC}
                          alt=""
                          className="h-6 w-6 rounded-full"
                        />
                        <span className="text-sm font-medium text-amplifi-text">
                          {order.destinationAsset}
                        </span>
                      </div>
                      <span
                        className={`rounded-[4px] px-2 py-0.5 text-xs font-medium capitalize ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                      <span className="text-xs text-amplifi-muted capitalize">
                        {order.action}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-amplifi-muted">
                        {formatDate(order.createdAt)}
                      </span>
                      <img
                        src={LOGOS.next}
                        alt="view"
                        className="h-5 w-5 text-amplifi-muted"
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {meta && meta.totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={!meta.hasPrevPage}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-lg border border-amplifi-border px-4 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-sm text-amplifi-muted">
            Page {page} of {meta.totalPages}
          </span>
          <button
            type="button"
            disabled={!meta.hasNextPage}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-amplifi-border px-4 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
