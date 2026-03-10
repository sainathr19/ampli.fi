import { type LoanOfferItem } from "@/lib/amplifi-api";
import { getAssetIconUrl, getProtocolIconUrl, LOGOS } from "@/lib/constants";
import { BorrowOffersListSkeleton } from "@/components/skeletons";
import { PaginationControls } from "@/components/ui/PaginationControls";

function formatPct(n: number): string {
  return (n * 100).toFixed(2);
}

export interface BorrowOffersListProps {
  offers: LoanOfferItem[];
  loading: boolean;
  borrowUsd?: number;
  targetLtv?: number;
  onSelectOffer?: (offer: { item: LoanOfferItem; isBest: boolean }) => void;
  page?: number;
  totalPages?: number;
  hasNextPage?: boolean;
  hasPrevPage?: boolean;
  onPageChange?: (page: number) => void;
}

export function BorrowOffersList({
  offers,
  loading,
  onSelectOffer,
  page = 1,
  totalPages = 1,
  hasNextPage = false,
  hasPrevPage = false,
  onPageChange,
}: BorrowOffersListProps) {
  const error: string | null = null;

  return (
    <section className="rounded-amplifi-lg bg-white p-4 sm:p-5 md:p-6 md:h-fit md:min-h-0">
      <p className="mb-0.5 flex items-center gap-2 text-base text-amplifi-text">
        <img src={LOGOS.borrow} alt="borrow" className="h-5 w-5" />
        Borrow offers
      </p>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {loading ? (
        <BorrowOffersListSkeleton />
      ) : (
        <ul className="space-y-0">
          {offers.map((item, index) => {
            const d = item.data;
            const protocolKey = (item.protocol ?? "").toLowerCase();
            const protocolDisplayName = protocolKey
              ? protocolKey.charAt(0).toUpperCase() + protocolKey.slice(1)
              : "Protocol";
            const poolName = d.pool.name;
            const liquidationPrice = d.quote?.liquidationPrice ?? 0;
            const isBest = (page - 1) * 4 + index === 0;
            return (
              <li
                key={d.offerId}
                role="button"
                tabIndex={0}
                className="flex flex-col gap-4 border-b border-amplifi-border py-6 last:border-b-0"
                onClick={() => onSelectOffer?.({ item, isBest })}
                onKeyDown={(e) =>
                  e.key === "Enter" && onSelectOffer?.({ item, isBest })
                }
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1 flex items-center gap-2">
                    <img
                      src={getProtocolIconUrl(item.protocol)}
                      alt=""
                      className="h-4 w-auto shrink-0 object-contain"
                    />
                    <div className="min-w-0 flex-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-medium text-amplifi-text break-words">
                        {protocolDisplayName}
                        {poolName ? ` · ${poolName}` : ""}
                      </span>
                      {isBest && (
                        <span className="rounded-[4px] text-amplifi-risk-safe bg-amplifi-risk-safe-bg/50 px-1.5 py-0.5 text-sm font-normal tracking-[-0.28px] shrink-0">
                          Best Offer
                        </span>
                      )}
                    </div>
                  </div>
                  <img
                    src={LOGOS.next}
                    alt="next"
                    className="h-7 w-7 shrink-0 text-amplifi-muted cursor-pointer"
                  />
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
                  <div className="min-w-0">
                    <p className="text-xs text-amplifi-muted break-words">Net APY</p>
                    <p className="text-sm font-semibold text-amplifi-text">{formatPct(d.netApy)}%</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-amplifi-muted break-words">Max LTV</p>
                    <p className="text-sm font-semibold text-amplifi-text">{formatPct(d.maxLtv)}%</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-amplifi-muted break-words">Liquidation Price</p>
                    <p className="text-sm font-semibold text-amplifi-text">
                      {liquidationPrice > 0
                        ? `$${liquidationPrice.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}`
                        : "—"}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-amplifi-muted break-words">Collateral</p>
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-amplifi-text">
                      <img
                        src={getAssetIconUrl(d.collateral.symbol)}
                        alt=""
                        className="h-4 w-4 shrink-0 rounded-full"
                      />
                      {d.collateral.symbol}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-amplifi-muted break-words">Loan</p>
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-amplifi-text">
                      <img
                        src={getAssetIconUrl(d.borrow.symbol)}
                        alt=""
                        className="h-4 w-4 shrink-0 rounded-full"
                      />
                      {d.borrow.symbol}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {!loading && !error && offers.length === 0 && (
        <p className="text-sm text-amplifi-text-muted">No offers found.</p>
      )}
      {onPageChange && (
        <PaginationControls
          page={page}
          totalPages={totalPages}
          hasNextPage={hasNextPage}
          hasPrevPage={hasPrevPage}
          onPageChange={onPageChange}
        />
      )}
    </section>
  );
}
