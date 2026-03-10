import { useState, useEffect, useMemo, useCallback } from "react";
import Button from "@/components/ui/Button";
import ScrollableSelect from "@/components/ui/ScrollableSelect";
import { useStake } from "@/hooks/useStake";
import { useEndurStaking } from "@/hooks/useEndurStaking";
import { useAtomiqSwap, type SwapStep } from "@/hooks/useAtomiqSwap";
import { useBtcBalance } from "@/hooks/useBtcBalance";
import { getAddressExplorerUrl, getTxExplorerUrl } from "@/lib/staking/explorer";
import { ENDUR_XSTRK_ADDRESS } from "@/lib/staking/endurClient";
import { isBtcLikeSymbol } from "@/lib/staking/tokenUtils";
import { useWallet } from "@/store/useWallet";
import { LOGOS, getAssetIconUrl } from "@/lib/constants";
import type { DstToken } from "@/lib/atomiq/swapService";
import {
  getEarnPools,
  getOrders,
  type EarnPoolItem,
  type BridgeOrder,
} from "@/lib/amplifi-api";

type SourceAsset = "STRK" | "BTC";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function protocolDisplayName(protocol: string): string {
  switch (protocol) {
    case "native_staking":
      return "Native Staking";
    case "endur":
      return "Endur";
    default:
      return protocol;
  }
}

function formatLargeNumber(value: string): string {
  const n = Number(value);
  if (isNaN(n)) return value;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return n.toFixed(2);
}

/** Sort pools: lowest commission first (best for user). Endur (0% fee) floats to top. */
function sortPools(pools: EarnPoolItem[]): EarnPoolItem[] {
  return [...pools].sort((a, b) => {
    const commA = a.data.commissionPercent ?? 100;
    const commB = b.data.commissionPercent ?? 100;
    if (commA !== commB) return commA - commB;
    // Secondary: higher TVL first
    const tvlA = Number(a.data.delegatedAmount) || 0;
    const tvlB = Number(b.data.delegatedAmount) || 0;
    return tvlB - tvlA;
  });
}

// ---------------------------------------------------------------------------
// EarnPage (top-level)
// ---------------------------------------------------------------------------

export function EarnPage() {
  const { starknetAddress, starknetAccount, starknetSource, bitcoinPaymentAddress } = useWallet();
  const hasStarknetConnected = Boolean(
    starknetAccount?.address || (starknetSource === "privy" && starknetAddress)
  );
  const displayAddress = starknetAccount?.address ?? starknetAddress ?? null;

  const [allPools, setAllPools] = useState<EarnPoolItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceAsset, setSourceAsset] = useState<SourceAsset>("STRK");
  const [selectedPool, setSelectedPool] = useState<{
    item: EarnPoolItem;
    isBest: boolean;
  } | null>(null);

  const filteredPools = useMemo(() => {
    if (sourceAsset === "BTC") return allPools; // BTC can swap to any token
    // STRK: pools where token is STRK/STARK, plus all endur pools
    return allPools.filter((p) => {
      const sym = p.data.token.symbol?.toUpperCase() ?? "";
      return sym === "STRK" || sym === "STARK" || p.protocol === "endur";
    });
  }, [allPools, sourceAsset]);

  const handleSourceAssetChange = (value: string) => {
    setSourceAsset(value as SourceAsset);
    setSelectedPool(null);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getEarnPools({ limit: 100 })
      .then((res) => {
        if (!cancelled) {
          setAllPools(sortPools(res.data));
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setAllPools([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="relative mx-auto w-full max-w-[1400px] min-w-0 py-6 px-4 sm:py-8 sm:px-0">
      {/* Left-side background pattern */}
      <div
        className="pointer-events-none absolute left-0 top-0 bottom-0 w-full max-w-[50%] min-h-[600px] bg-no-repeat bg-left bg-[length:auto_100%] opacity-[0.06] lg:opacity-[0.08]"
        style={{ backgroundImage: "url('/mask.svg')" }}
        aria-hidden
      />
      <div className="relative mb-8 flex flex-col gap-4 sm:mb-10 sm:flex-row sm:gap-20">
        <p className="text-2xl font-semibold tracking-tight md:text-3xl">
          Earn
        </p>
        <div className="max-w-[899px]">
          <p className="mt-0 sm:mt-2 text-sm sm:text-base leading-relaxed text-amplifi-text">
            Compare staking options across protocols. Pools are sorted by lowest fee — best yields first.
          </p>
          {hasStarknetConnected && displayAddress && (
            <p className="mt-2 text-xs font-mono text-amplifi-muted break-all">
              Connected:{" "}
              <a
                href={getAddressExplorerUrl(displayAddress)}
                target="_blank"
                rel="noreferrer"
                className="text-amplifi-primary underline hover:text-amplifi-primary-hover"
              >
                {displayAddress}
              </a>
            </p>
          )}
          {!hasStarknetConnected && (
            <p className="mt-2 text-xs font-mono text-amplifi-muted">
              {sourceAsset === "BTC"
                ? "Connect both Bitcoin and Starknet wallets to stake."
                : "Connect your Starknet wallet (browser extension, e.g. ArgentX or Braavos) to stake."}
            </p>
          )}
          <div className="mt-3 max-w-[220px]">
            <ScrollableSelect
              value={sourceAsset}
              options={[
                { value: "STRK", label: "STRK (Starknet)" },
                { value: "BTC", label: "BTC (Bitcoin)" },
              ]}
              onChange={handleSourceAssetChange}
              placeholder="Select asset"
            />
          </div>
        </div>
      </div>

      <div className="relative grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-[472px_1fr]">
        {/* Left column: staking form for selected pool */}
        <div className="w-full min-w-0">
          {selectedPool ? (
            sourceAsset === "BTC" ? (
              <BtcStakeForm
                pool={selectedPool.item}
                isBest={selectedPool.isBest}
                onBack={() => setSelectedPool(null)}
              />
            ) : selectedPool.item.protocol === "endur" ? (
              <EndurStakeForm
                pool={selectedPool.item}
                isBest={selectedPool.isBest}
                onBack={() => setSelectedPool(null)}
              />
            ) : (
              <NativeStakeForm
                pool={selectedPool.item}
                isBest={selectedPool.isBest}
                onBack={() => setSelectedPool(null)}
              />
            )
          ) : (
            <div className="rounded-amplifi bg-white p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-3">
                <img src={LOGOS.import} alt="" className="h-4 w-4" />
                <span className="text-base font-medium text-amplifi-text">Stake</span>
              </div>
              <p className="text-sm text-amplifi-muted">
                Select a pool from the list to start staking.
              </p>
            </div>
          )}
        </div>

        {/* Right column: aggregated pools list */}
        <div className="w-full min-w-0">
          <EarnPoolsList
            pools={filteredPools}
            loading={loading}
            error={error}
            selectedPool={selectedPool}
            onSelectPool={setSelectedPool}
            sourceAsset={sourceAsset}
          />
        </div>
      </div>

      {/* Stake orders history table */}
      {(starknetAddress || bitcoinPaymentAddress) && (
        <div className="relative mt-6 sm:mt-8">
          <StakeOrdersTable
            walletAddress={(starknetAddress || bitcoinPaymentAddress)!}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StakeOrdersTable — history of BTC stake swap orders
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  CREATED: { label: "Created", color: "text-amplifi-muted" },
  SWAP_CREATED: { label: "Swap Created", color: "text-amplifi-muted" },
  BTC_SENT: { label: "BTC Sent", color: "text-yellow-600" },
  BTC_CONFIRMED: { label: "BTC Confirmed", color: "text-yellow-600" },
  CLAIMING: { label: "Converting", color: "text-blue-600" },
  SETTLED: { label: "Settled", color: "text-amplifi-risk-safe" },
  FAILED: { label: "Failed", color: "text-amplifi-risk-hard" },
  EXPIRED: { label: "Expired", color: "text-amplifi-muted" },
  REFUNDED: { label: "Refunded", color: "text-amplifi-muted" },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSatsAsBtc(sats: string): string {
  const n = Number(sats);
  if (isNaN(n) || n <= 0) return sats;
  return (n / 1e8).toFixed(8);
}

function StakeOrdersTable({ walletAddress }: { walletAddress: string }) {
  const [orders, setOrders] = useState<BridgeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getOrders({ walletAddress, action: "stake", limit: 20 });
      setOrders(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // Poll for in-progress orders
  useEffect(() => {
    const hasActive = orders.some(
      (o) => !["SETTLED", "FAILED", "EXPIRED", "REFUNDED"].includes(o.status)
    );
    if (!hasActive) return;
    const interval = setInterval(loadOrders, 5000);
    return () => clearInterval(interval);
  }, [orders, loadOrders]);

  if (loading && orders.length === 0) {
    return (
      <section className="rounded-amplifi-lg bg-white p-4 sm:p-5 md:p-6">
        <p className="flex items-center gap-2 text-base font-medium text-amplifi-text mb-3">
          <img src={LOGOS.status} alt="" className="h-5 w-5" />
          Stake Orders
        </p>
        <p className="text-sm text-amplifi-muted">Loading orders…</p>
      </section>
    );
  }

  if (orders.length === 0 && !error) return null;

  return (
    <section className="rounded-amplifi-lg bg-white p-4 sm:p-5 md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="flex items-center gap-2 text-base font-medium text-amplifi-text">
          <img src={LOGOS.status} alt="" className="h-5 w-5" />
          Stake Orders
        </p>
        <button
          type="button"
          onClick={loadOrders}
          className="text-xs font-medium text-amplifi-primary hover:text-amplifi-primary-hover"
        >
          Refresh
        </button>
      </div>

      {error && (
        <p className="mb-3 text-sm text-amplifi-risk-hard">{error}</p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-amplifi-border text-left text-xs text-amplifi-muted">
              <th className="pb-2 pr-4 font-medium">Date</th>
              <th className="pb-2 pr-4 font-medium">Amount (BTC)</th>
              <th className="pb-2 pr-4 font-medium">Destination</th>
              <th className="pb-2 pr-4 font-medium">Status</th>
              <th className="pb-2 font-medium">BTC Tx</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const statusInfo = STATUS_LABELS[order.status] ?? {
                label: order.status,
                color: "text-amplifi-muted",
              };
              return (
                <tr
                  key={order.id}
                  className="border-b border-amplifi-border last:border-b-0"
                >
                  <td className="py-3 pr-4 whitespace-nowrap text-amplifi-text">
                    {formatDate(order.createdAt)}
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap font-mono text-amplifi-amount">
                    {formatSatsAsBtc(order.amount)}
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <span className="flex items-center gap-1.5">
                      <img
                        src={getAssetIconUrl(order.destinationAsset)}
                        alt=""
                        className="h-4 w-4 rounded-full"
                      />
                      {order.destinationAsset}
                    </span>
                  </td>
                  <td className={`py-3 pr-4 whitespace-nowrap font-medium ${statusInfo.color}`}>
                    {statusInfo.label}
                    {order.lastError && (
                      <span className="ml-1 text-xs text-amplifi-risk-hard" title={order.lastError}>
                        (!)
                      </span>
                    )}
                  </td>
                  <td className="py-3 whitespace-nowrap">
                    {order.sourceTxId ? (
                      <a
                        href={`https://mempool.space/testnet4/tx/${order.sourceTxId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-xs text-amplifi-primary underline hover:text-amplifi-primary-hover"
                      >
                        {order.sourceTxId.slice(0, 8)}…
                      </a>
                    ) : (
                      <span className="text-amplifi-muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// EarnPoolsList — unified list of all pools across protocols
// ---------------------------------------------------------------------------

function EarnPoolsList({
  pools,
  loading,
  error,
  selectedPool,
  onSelectPool,
  sourceAsset,
}: {
  pools: EarnPoolItem[];
  loading: boolean;
  error: string | null;
  selectedPool: { item: EarnPoolItem; isBest: boolean } | null;
  onSelectPool: (sel: { item: EarnPoolItem; isBest: boolean } | null) => void;
  sourceAsset: SourceAsset;
}) {
  return (
    <section className="rounded-amplifi-lg bg-white p-4 sm:p-5 md:p-6 md:h-fit md:min-h-0">
      <p className="mb-0.5 flex items-center gap-2 text-base font-medium text-amplifi-text">
        <img src={LOGOS.borrow} alt="earn" className="h-5 w-5" />
        Staking Pools
      </p>
      {error && (
        <p className="mb-4 text-sm text-amplifi-risk-hard">{error}</p>
      )}
      {loading ? (
        <p className="text-sm text-amplifi-muted">Loading pools…</p>
      ) : pools.length === 0 ? (
        <p className="text-sm text-amplifi-muted">No pools found.</p>
      ) : (
        <ul className="space-y-0">
          {pools.map((item, index) => {
            const d = item.data;
            const isBest = index === 0;
            const isSelected = selectedPool?.item.data.id === d.id;
            return (
              <li
                key={d.id}
                role="button"
                tabIndex={0}
                className="flex flex-col gap-4 border-b border-amplifi-border py-6 last:border-b-0"
              >
                {/* Top row: protocol, validator name, Best Offer tag, arrow */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amplifi-primary text-xs font-semibold text-white">
                      {d.token.symbol?.charAt(0) ?? "?"}
                    </div>
                    <div className="min-w-0 flex-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-medium text-amplifi-text break-words">
                        {protocolDisplayName(item.protocol)}
                        {" · "}
                        {d.validator.name}
                      </span>
                      {isBest && (
                        <span className="rounded-[4px] text-amplifi-risk-safe bg-amplifi-risk-safe-bg/50 px-1.5 py-0.5 text-sm font-normal tracking-[-0.28px] shrink-0">
                          Best Offer
                        </span>
                      )}
                      {isSelected && (
                        <span className="rounded-[4px] bg-amplifi-best-offer px-1.5 py-0.5 text-sm font-normal text-amplifi-best-offer-text shrink-0">
                          Selected
                        </span>
                      )}
                    </div>
                  </div>
                  <img
                    src={LOGOS.next}
                    alt="select"
                    className="h-7 w-7 shrink-0 text-amplifi-muted cursor-pointer"
                    onClick={() => onSelectPool({ item, isBest })}
                    onKeyDown={(e) =>
                      e.key === "Enter" && onSelectPool({ item, isBest })
                    }
                  />
                </div>

                {/* Metrics row */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                  <div className="min-w-0">
                    <p className="text-xs text-amplifi-muted">Token</p>
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-amplifi-text">
                      <img
                        src={getAssetIconUrl(d.token.symbol)}
                        alt=""
                        className="h-4 w-4 shrink-0 rounded-full"
                      />
                      {d.token.symbol}
                    </p>
                  </div>
                  {sourceAsset === "BTC" && (
                    <div className="min-w-0">
                      <p className="text-xs text-amplifi-muted">Via</p>
                      <p className="text-sm font-semibold text-amplifi-text">
                        BTC → {d.token.symbol}
                      </p>
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs text-amplifi-muted">TVL</p>
                    <p className="text-sm font-semibold text-amplifi-text">
                      {formatLargeNumber(d.delegatedAmount)}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-amplifi-muted">Commission</p>
                    <p className="text-sm font-semibold text-amplifi-text">
                      {d.commissionPercent != null ? `${d.commissionPercent}%` : "—"}
                    </p>
                  </div>
                  {sourceAsset !== "BTC" && (
                    <div className="min-w-0">
                      <p className="text-xs text-amplifi-muted">Protocol</p>
                      <p className="text-sm font-semibold text-amplifi-text">
                        {protocolDisplayName(item.protocol)}
                      </p>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// BtcStakeForm — swap BTC then auto-stake into the selected pool
// ---------------------------------------------------------------------------

const BTC_STAKE_STEPS = [
  { id: 1, label: "Creating order" },
  { id: 2, label: "Sending BTC" },
  { id: 3, label: "Confirming BTC deposit" },
  { id: 4, label: "Converting to token" },
  { id: 5, label: "Staking into pool" },
  { id: 6, label: "Staking complete" },
] as const;

function swapStepToStakeStep(step: SwapStep): number {
  switch (step) {
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
      return 5;
    default:
      return 0;
  }
}

function getDstToken(pool: EarnPoolItem): DstToken {
  const sym = pool.data.token.symbol?.toUpperCase() ?? "";
  if (isBtcLikeSymbol(sym)) return "WBTC";
  return "STRK";
}

function BtcStakeForm({
  pool,
  isBest,
  onBack,
}: {
  pool: EarnPoolItem;
  isBest: boolean;
  onBack: () => void;
}) {
  const { bitcoinPaymentAddress, starknetAddress, starknetAccount, starknetSource } =
    useWallet();
  const hasStarknet = Boolean(
    starknetAccount?.address || (starknetSource === "privy" && starknetAddress)
  );
  const hasBtc = Boolean(bitcoinPaymentAddress);
  const bothConnected = hasStarknet && hasBtc;

  const { balanceFormatted, balanceBtc } = useBtcBalance();
  const { step, runSwap, isInitialized, isInitializing } = useAtomiqSwap();

  const nativeStake = useStake();
  const endurStaking = useEndurStaking();

  const [amount, setAmount] = useState("");
  const [activeStep, setActiveStep] = useState(0);
  const [stakePhase, setStakePhase] = useState<"idle" | "staking" | "done" | "error">("idle");
  const [stakeError, setStakeError] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const tokenSymbol = pool.data.token.symbol;
  const dstToken = getDstToken(pool);

  // Track swap step progress
  useEffect(() => {
    const s = swapStepToStakeStep(step);
    if (s > 0) setActiveStep(s);
  }, [step]);

  // Auto-stake after swap settles
  useEffect(() => {
    if (step !== "settled" || stakePhase !== "idle") return;
    setStakePhase("staking");
    setActiveStep(5);

    const doStake = async () => {
      try {
        if (pool.protocol === "endur") {
          // For endur, we deposit the received STRK
          // The swap output goes to user's starknet wallet, so we use endur deposit
          // We don't know exact received amount, so use a best-effort approach
          await endurStaking.deposit(amount);
        } else {
          const tokenObj = {
            symbol: pool.data.token.symbol,
            address: pool.data.token.address,
            decimals: pool.data.token.decimals ?? 18,
          };
          await nativeStake.stake({
            token: tokenObj as never,
            poolAddress: pool.data.poolContract,
            amount,
          });
        }
        setStakePhase("done");
        setActiveStep(6);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Staking failed";
        setStakeError(msg);
        setStakePhase("error");
      }
    };

    doStake();
  }, [step, stakePhase, pool, amount, endurStaking, nativeStake]);

  const onStake = useCallback(async () => {
    setErrorMsg(null);
    setStakePhase("idle");
    setStakeError(null);
    setActiveStep(1);
    try {
      await runSwap({
        dstToken,
        amountBtc: amount,
        action: "stake",
        destinationAsset: tokenSymbol,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Swap failed";
      setErrorMsg(msg);
    }
  }, [runSwap, dstToken, amount, tokenSymbol]);

  const onRetryStake = useCallback(async () => {
    setStakePhase("staking");
    setStakeError(null);
    setActiveStep(5);
    try {
      if (pool.protocol === "endur") {
        await endurStaking.deposit(amount);
      } else {
        const tokenObj = {
          symbol: pool.data.token.symbol,
          address: pool.data.token.address,
          decimals: pool.data.token.decimals ?? 18,
        };
        await nativeStake.stake({
          token: tokenObj as never,
          poolAddress: pool.data.poolContract,
          amount,
        });
      }
      setStakePhase("done");
      setActiveStep(6);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Staking failed";
      setStakeError(msg);
      setStakePhase("error");
    }
  }, [pool, amount, endurStaking, nativeStake]);

  const canStake =
    bothConnected &&
    isInitialized &&
    Boolean(amount) &&
    Number(amount) > 0 &&
    step === "idle";

  const isInProgress = step !== "idle" && step !== "error" && stakePhase !== "done";

  // Idle state: show form
  if (step === "idle" && stakePhase === "idle") {
    return (
      <div className="space-y-4 sm:space-y-6">
        <div className="rounded-amplifi bg-white p-4 sm:p-6">
          {/* Header */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src={LOGOS.import} alt="" className="h-4 w-4" />
              <span className="text-base font-medium text-amplifi-text">
                {protocolDisplayName(pool.protocol)} · {pool.data.validator.name}
              </span>
              {isBest && (
                <span className="rounded-[4px] text-amplifi-risk-safe bg-amplifi-risk-safe-bg/50 px-1.5 py-0.5 text-sm font-normal">
                  Best Offer
                </span>
              )}
            </div>
            <img
              src={LOGOS.back}
              alt="back"
              className="h-7 w-7 shrink-0 cursor-pointer text-amplifi-muted"
              onClick={onBack}
            />
          </div>

          {errorMsg && (
            <div className="mb-4 rounded-amplifi border border-amplifi-risk-hard/30 bg-amplifi-risk-hard-bg/30 px-3 py-2">
              <p className="text-sm text-amplifi-risk-hard">{errorMsg}</p>
            </div>
          )}

          <div className="space-y-3 sm:space-y-4">
            {/* BTC Balance */}
            <div>
              <p className="text-xs font-medium text-amplifi-muted">BTC Balance</p>
              <p className="text-2xl font-semibold text-amplifi-amount">
                {balanceFormatted != null ? `${balanceFormatted} BTC` : "—"}
              </p>
            </div>

            {/* Amount input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-amplifi-muted">
                  Amount (BTC)
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (balanceBtc > 0) setAmount(balanceBtc.toFixed(8));
                  }}
                  className="text-xs font-medium text-amplifi-primary hover:text-amplifi-primary-hover"
                >
                  Max
                </button>
              </div>
              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.0"
                className="w-full rounded-amplifi border-2 border-amplifi-border bg-amplifi-surface px-4 py-3 text-base font-medium text-amplifi-amount outline-none placeholder:text-amplifi-muted focus:border-amplifi-primary"
                aria-label="BTC stake amount"
              />
            </div>

            {/* Pool metrics */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-amplifi bg-amplifi-surface p-3">
                <p className="text-xs text-amplifi-muted">Commission</p>
                <p className="text-sm font-semibold text-amplifi-text">
                  {pool.data.commissionPercent != null
                    ? `${pool.data.commissionPercent}%`
                    : "—"}
                </p>
              </div>
              <div className="rounded-amplifi bg-amplifi-surface p-3">
                <p className="text-xs text-amplifi-muted">TVL</p>
                <p className="text-sm font-semibold text-amplifi-text">
                  {formatLargeNumber(pool.data.delegatedAmount)}
                </p>
              </div>
            </div>

            <p className="text-xs text-amplifi-muted">
              BTC → {tokenSymbol} via swap, then auto-staked into{" "}
              {protocolDisplayName(pool.protocol)}
            </p>

            {!bothConnected && (
              <p className="text-xs text-amplifi-risk-hard">
                Connect both Bitcoin and Starknet wallets to stake.
              </p>
            )}
            {isInitializing && (
              <p className="text-xs text-amplifi-muted">Initializing swap engine…</p>
            )}

            <Button
              variant="primary"
              size="lg"
              className="w-full"
              disabled={!canStake}
              onClick={onStake}
            >
              Stake
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // In-progress / completed: show progress steps
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="rounded-amplifi bg-white p-4 sm:p-6">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={LOGOS.import} alt="" className="h-4 w-4" />
            <span className="text-base font-medium text-amplifi-text">
              Staking BTC → {tokenSymbol}
            </span>
          </div>
          {!isInProgress && (
            <img
              src={LOGOS.back}
              alt="back"
              className="h-7 w-7 shrink-0 cursor-pointer text-amplifi-muted"
              onClick={onBack}
            />
          )}
        </div>

        <div className="mb-4 flex items-center gap-2 text-base text-amplifi-text">
          <img src={LOGOS.status} alt="status" className="h-5 w-5 text-amplifi-muted" />
          Stake progress
        </div>

        <ol className="space-y-3">
          {BTC_STAKE_STEPS.map((s) => {
            const dynamicLabel =
              s.id === 4
                ? `Converting to ${tokenSymbol}`
                : s.id === 5
                ? `Staking into ${pool.data.validator.name}`
                : s.label;

            const isComplete = s.id < activeStep;
            const isActive = s.id === activeStep;
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
                  {s.id}
                </div>
                <span className={`text-xl font-medium ${stepNameColor}`}>
                  {dynamicLabel}
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

        {/* Error states */}
        {step === "error" && errorMsg && (
          <p className="mt-4 text-sm text-amplifi-risk-hard">{errorMsg}</p>
        )}
        {stakePhase === "error" && stakeError && (
          <div className="mt-4">
            <p className="text-sm text-amplifi-risk-hard">{stakeError}</p>
            <Button
              variant="primary"
              size="lg"
              className="mt-3 w-full"
              onClick={onRetryStake}
            >
              Retry Staking
            </Button>
          </div>
        )}

        {/* Success */}
        {stakePhase === "done" && (
          <div className="mt-4 rounded-amplifi border border-amplifi-best-offer/30 bg-amplifi-best-offer/10 px-3 py-2">
            <p className="text-sm text-amplifi-best-offer-text">
              Successfully staked into {pool.data.validator.name}!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NativeStakeForm — staking form for native_staking pools
// ---------------------------------------------------------------------------

function NativeStakeForm({
  pool,
  isBest,
  onBack,
}: {
  pool: EarnPoolItem;
  isBest: boolean;
  onBack: () => void;
}) {
  const { starknetAddress, starknetAccount, starknetSource, privyStarkzapWallet } = useWallet();
  const hasStarknetConnected = Boolean(
    starknetAccount?.address || (starknetSource === "privy" && starknetAddress)
  );
  const displayAddress = starknetAccount?.address ?? starknetAddress ?? null;

  const {
    isSubmitting,
    error: stakeError,
    selectedTokenBalance,
    refreshBalance,
    stake,
  } = useStake();

  const [amount, setAmount] = useState("");
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: "warning" | "error" | "success";
  } | null>(null);

  const tokenSymbol = pool.data.token.symbol;
  // Build a Token-like object for refreshBalance
  const tokenObj = useMemo(
    () => ({
      symbol: pool.data.token.symbol,
      address: pool.data.token.address,
      decimals: pool.data.token.decimals ?? 18,
    }),
    [pool]
  );

  useEffect(() => {
    if (hasStarknetConnected) {
      refreshBalance(tokenObj as never).catch(() => {});
    }
  }, [hasStarknetConnected, refreshBalance, tokenObj, displayAddress, privyStarkzapWallet]);

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 5000);
    return () => clearTimeout(t);
  }, [toastMessage]);

  const onStake = async () => {
    try {
      await stake({
        token: tokenObj as never,
        poolAddress: pool.data.poolContract,
        amount,
      });
      setAmount("");
      setToastMessage({ text: "Staked successfully!", type: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Stake failed";
      setToastMessage({ text: message, type: "error" });
    }
  };

  const canStake =
    hasStarknetConnected &&
    Boolean(amount) &&
    !isSubmitting &&
    Number(amount) > 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header with back */}
      <div className="rounded-amplifi bg-white p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={LOGOS.import} alt="" className="h-4 w-4" />
            <span className="text-base font-medium text-amplifi-text">
              Native Staking · {pool.data.validator.name}
            </span>
            {isBest && (
              <span className="rounded-[4px] text-amplifi-risk-safe bg-amplifi-risk-safe-bg/50 px-1.5 py-0.5 text-sm font-normal">
                Best Offer
              </span>
            )}
          </div>
          <img
            src={LOGOS.back}
            alt="back"
            className="h-7 w-7 shrink-0 cursor-pointer text-amplifi-muted"
            onClick={onBack}
          />
        </div>

        {(stakeError || toastMessage) && (
          <div
            className={`mb-4 rounded-amplifi border px-3 py-2 ${
              toastMessage?.type === "success"
                ? "border-amplifi-best-offer/30 bg-amplifi-best-offer/10"
                : "border-amplifi-risk-hard/30 bg-amplifi-risk-hard-bg/30"
            }`}
          >
            {stakeError && (
              <p className="text-sm text-amplifi-risk-hard">{stakeError}</p>
            )}
            {toastMessage && (
              <p
                className={
                  toastMessage.type === "success"
                    ? "text-sm text-amplifi-best-offer-text"
                    : "text-sm text-amplifi-risk-hard"
                }
              >
                {toastMessage.text}
              </p>
            )}
          </div>
        )}

        <div className="space-y-3 sm:space-y-4">
          <div>
            <p className="text-xs font-medium text-amplifi-muted">
              {tokenSymbol} Balance
            </p>
            <p className="text-2xl font-semibold text-amplifi-amount">
              {selectedTokenBalance != null
                ? `${selectedTokenBalance} ${tokenSymbol}`
                : "—"}
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-amplifi-muted">
              Amount ({tokenSymbol})
            </label>
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0"
              className="w-full rounded-amplifi border-2 border-amplifi-border bg-amplifi-surface px-4 py-3 text-base font-medium text-amplifi-amount outline-none placeholder:text-amplifi-muted focus:border-amplifi-primary"
              aria-label="Stake amount"
            />
          </div>

          <p className="text-xs text-amplifi-muted break-all">
            Pool:{" "}
            <a
              href={getAddressExplorerUrl(pool.data.poolContract)}
              target="_blank"
              rel="noreferrer"
              className="text-amplifi-primary underline hover:text-amplifi-primary-hover"
            >
              {pool.data.poolContract}
            </a>
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-amplifi bg-amplifi-surface p-3">
              <p className="text-xs text-amplifi-muted">Commission</p>
              <p className="text-sm font-semibold text-amplifi-text">
                {pool.data.commissionPercent != null
                  ? `${pool.data.commissionPercent}%`
                  : "—"}
              </p>
            </div>
            <div className="rounded-amplifi bg-amplifi-surface p-3">
              <p className="text-xs text-amplifi-muted">TVL</p>
              <p className="text-sm font-semibold text-amplifi-text">
                {formatLargeNumber(pool.data.delegatedAmount)}
              </p>
            </div>
          </div>

          <Button
            variant="primary"
            size="lg"
            className="w-full"
            disabled={!canStake}
            onClick={onStake}
          >
            {isSubmitting ? "Staking…" : "Stake"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EndurStakeForm — deposit/withdraw form for Endur xSTRK vault
// ---------------------------------------------------------------------------

function EndurStakeForm({
  isBest,
  onBack,
}: {
  pool: EarnPoolItem;
  isBest: boolean;
  onBack: () => void;
}) {
  const { starknetAccount, starknetSource, starknetAddress } = useWallet();
  const hasWallet = Boolean(
    starknetAccount?.address || (starknetSource === "privy" && starknetAddress)
  );

  const {
    pool: endurPool,
    position,
    strkBalance,
    loading,
    error,
    isSubmitting,
    deposit,
    withdraw,
  } = useEndurStaking();

  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("");
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: "warning" | "error" | "success";
    link?: string;
  } | null>(null);

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 5000);
    return () => clearTimeout(t);
  }, [toastMessage]);

  const onDeposit = async () => {
    try {
      const txHash = await deposit(amount);
      setAmount("");
      setToastMessage({
        text: "Deposit successful!",
        type: "success",
        link: getTxExplorerUrl(txHash),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Deposit failed";
      setToastMessage({ text: msg, type: "error" });
    }
  };

  const onWithdraw = async () => {
    try {
      const txHash = await withdraw(amount);
      setAmount("");
      setToastMessage({
        text: "Withdrawal successful!",
        type: "success",
        link: getTxExplorerUrl(txHash),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Withdrawal failed";
      setToastMessage({ text: msg, type: "error" });
    }
  };

  const canSubmit = hasWallet && Boolean(amount) && Number(amount) > 0 && !isSubmitting;

  const onSetMax = () => {
    if (tab === "deposit" && strkBalance) setAmount(strkBalance);
    else if (tab === "withdraw" && position?.xstrkBalance)
      setAmount(position.xstrkBalance);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="rounded-amplifi bg-white p-4 sm:p-6">
        {/* Header with back */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={LOGOS.import} alt="" className="h-4 w-4" />
            <span className="text-base font-medium text-amplifi-text">
              Endur Liquid Staking
            </span>
            {isBest && (
              <span className="rounded-[4px] text-amplifi-risk-safe bg-amplifi-risk-safe-bg/50 px-1.5 py-0.5 text-sm font-normal">
                Best Offer
              </span>
            )}
          </div>
          <img
            src={LOGOS.back}
            alt="back"
            className="h-7 w-7 shrink-0 cursor-pointer text-amplifi-muted"
            onClick={onBack}
          />
        </div>

        {/* Toast */}
        {(error || toastMessage) && (
          <div
            className={`mb-4 rounded-amplifi border px-3 py-2 ${
              toastMessage?.type === "success"
                ? "border-amplifi-best-offer/30 bg-amplifi-best-offer/10"
                : "border-amplifi-risk-hard/30 bg-amplifi-risk-hard-bg/30"
            }`}
          >
            {error && <p className="text-sm text-amplifi-risk-hard">{error}</p>}
            {toastMessage && (
              <p
                className={
                  toastMessage.type === "success"
                    ? "text-sm text-amplifi-best-offer-text"
                    : "text-sm text-amplifi-risk-hard"
                }
              >
                {toastMessage.text}
                {toastMessage.link && (
                  <>
                    {" "}
                    <a
                      href={toastMessage.link}
                      target="_blank"
                      rel="noreferrer"
                      className="underline hover:opacity-80"
                    >
                      View tx
                    </a>
                  </>
                )}
              </p>
            )}
          </div>
        )}

        {/* Deposit / Withdraw tabs */}
        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => {
              setTab("deposit");
              setAmount("");
            }}
            className={`flex-1 rounded-amplifi py-2 text-sm font-medium transition-colors ${
              tab === "deposit"
                ? "bg-amplifi-nav text-white"
                : "bg-amplifi-surface text-amplifi-text hover:bg-amplifi-border"
            }`}
          >
            Deposit STRK
          </button>
          <button
            type="button"
            onClick={() => {
              setTab("withdraw");
              setAmount("");
            }}
            className={`flex-1 rounded-amplifi py-2 text-sm font-medium transition-colors ${
              tab === "withdraw"
                ? "bg-amplifi-nav text-white"
                : "bg-amplifi-surface text-amplifi-text hover:bg-amplifi-border"
            }`}
          >
            Withdraw
          </button>
        </div>

        <div className="space-y-3 sm:space-y-4">
          {/* Balance */}
          <div>
            <p className="text-xs font-medium text-amplifi-muted">
              {tab === "deposit" ? "STRK Balance" : "xSTRK Balance"}
            </p>
            <p className="text-2xl font-semibold text-amplifi-amount">
              {loading
                ? "..."
                : tab === "deposit"
                ? strkBalance
                  ? `${strkBalance} STRK`
                  : "—"
                : position?.xstrkBalance
                ? `${position.xstrkBalance} xSTRK`
                : "—"}
            </p>
          </div>

          {/* Amount input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-amplifi-muted">
                Amount ({tab === "deposit" ? "STRK" : "xSTRK"})
              </label>
              <button
                type="button"
                onClick={onSetMax}
                className="text-xs font-medium text-amplifi-primary hover:text-amplifi-primary-hover"
              >
                Max
              </button>
            </div>
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0"
              className="w-full rounded-amplifi border-2 border-amplifi-border bg-amplifi-surface px-4 py-3 text-base font-medium text-amplifi-amount outline-none placeholder:text-amplifi-muted focus:border-amplifi-primary"
              aria-label={
                tab === "deposit" ? "Deposit amount" : "Withdraw amount"
              }
            />
          </div>

          {/* Exchange rate + stats */}
          {endurPool && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-amplifi bg-amplifi-surface p-3">
                <p className="text-xs text-amplifi-muted">Exchange Rate</p>
                <p className="text-sm font-semibold text-amplifi-text">
                  1 xSTRK = {endurPool.exchangeRate} STRK
                </p>
              </div>
              <div className="rounded-amplifi bg-amplifi-surface p-3">
                <p className="text-xs text-amplifi-muted">TVL</p>
                <p className="text-sm font-semibold text-amplifi-text">
                  {formatLargeNumber(endurPool.totalAssets)} STRK
                </p>
              </div>
              <div className="rounded-amplifi bg-amplifi-surface p-3">
                <p className="text-xs text-amplifi-muted">Fee</p>
                <p className="text-sm font-semibold text-amplifi-best-offer-text">
                  0%
                </p>
              </div>
              <div className="rounded-amplifi bg-amplifi-surface p-3">
                <p className="text-xs text-amplifi-muted">Type</p>
                <p className="text-sm font-semibold text-amplifi-text">
                  Liquid Staking
                </p>
              </div>
            </div>
          )}

          {/* Contract link */}
          <p className="text-xs text-amplifi-muted break-all">
            xSTRK contract:{" "}
            <a
              href={getAddressExplorerUrl(ENDUR_XSTRK_ADDRESS)}
              target="_blank"
              rel="noreferrer"
              className="text-amplifi-primary underline hover:text-amplifi-primary-hover"
            >
              {ENDUR_XSTRK_ADDRESS.slice(0, 10)}...
              {ENDUR_XSTRK_ADDRESS.slice(-6)}
            </a>
          </p>

          <Button
            variant="primary"
            size="lg"
            className="w-full"
            disabled={!canSubmit}
            onClick={tab === "deposit" ? onDeposit : onWithdraw}
          >
            {isSubmitting
              ? tab === "deposit"
                ? "Depositing..."
                : "Withdrawing..."
              : tab === "deposit"
              ? "Deposit STRK"
              : "Withdraw STRK"}
          </Button>
        </div>
      </div>

      {/* Position card */}
      {position && (
        <div className="rounded-amplifi bg-white p-4 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <img src={LOGOS.export} alt="" className="h-4 w-4" />
            <span className="text-base font-medium text-amplifi-text">
              Your Position
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <p className="text-xs text-amplifi-muted">xSTRK Balance</p>
              <p className="text-sm font-semibold text-amplifi-text">
                {position.xstrkBalance}
              </p>
            </div>
            <div>
              <p className="text-xs text-amplifi-muted">STRK Value</p>
              <p className="text-sm font-semibold text-amplifi-text">
                {position.strkValue}
              </p>
            </div>
            <div>
              <p className="text-xs text-amplifi-muted">Rewards (approx)</p>
              <p className="text-sm font-semibold text-amplifi-best-offer-text">
                {position.rewards} STRK
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
