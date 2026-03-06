import { useState, useEffect, useMemo } from "react";
import Button from "@/components/ui/Button";
import ScrollableSelect from "@/components/ui/ScrollableSelect";
import { useStakingPools } from "@/hooks/useStakingPools";
import { useStake } from "@/hooks/useStake";
import { getAddressExplorerUrl } from "@/lib/staking/explorer";
import { STARKNET_NETWORK } from "@/lib/staking/starkzapClient";
import { useWallet } from "@/store/useWallet";
import { LOGOS, getAssetIconUrl } from "@/lib/constants";
import type { Pool } from "starkzap";

export function EarnPage() {
  const { starknetAddress, starknetAccount, starknetSource, privyStarkzapWallet } = useWallet();
  const hasStarknetConnected = Boolean(
    starknetAccount?.address || (starknetSource === "privy" && starknetAddress)
  );
  const displayAddress = starknetAccount?.address ?? starknetAddress ?? null;

  const {
    validators,
    selectedValidatorAddress,
    setSelectedValidatorAddress,
    tokens,
    selectedToken,
    selectedTokenAddress,
    setSelectedTokenAddress,
    pools,
    selectedPool,
    hasBtcLikeTokens,
    hasBtcLikePools,
    loading,
    error,
  } = useStakingPools();

  const {
    isSubmitting,
    error: stakeError,
    selectedTokenBalance,
    refreshBalance,
    stake,
  } = useStake();

  const [amount, setAmount] = useState("");
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "warning" | "error" } | null>(null);

  const selectedTokenSymbol = selectedToken?.symbol ?? "Token";
  const showBtcStakingUnavailable =
    STARKNET_NETWORK === "sepolia" &&
    !loading &&
    tokens.length > 0 &&
    (!hasBtcLikeTokens || !hasBtcLikePools);

  const displayBalance = useMemo(() => {
    return selectedTokenBalance ?? null;
  }, [selectedTokenBalance]);

  useEffect(() => {
    if (hasStarknetConnected && selectedToken) {
      refreshBalance(selectedToken).catch(() => {});
    }
  }, [hasStarknetConnected, refreshBalance, selectedToken, displayAddress, privyStarkzapWallet]);

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 5000);
    return () => clearTimeout(t);
  }, [toastMessage]);

  const onStake = async () => {
    if (!selectedToken || !selectedPool) {
      setToastMessage({ text: "Select a validator pool before staking", type: "warning" });
      return;
    }

    try {
      await stake({
        token: selectedToken,
        poolAddress: selectedPool.poolContract,
        amount,
      });
      setAmount("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Stake failed";
      setToastMessage({ text: message, type: "error" });
    }
  };

  const canStake =
    hasStarknetConnected &&
    Boolean(selectedToken) &&
    Boolean(selectedPool) &&
    Boolean(amount) &&
    !isSubmitting &&
    Number(amount) > 0;

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
            Stake directly on Starknet using supported validators and pools. Earn yield on your assets.
          </p>
          {showBtcStakingUnavailable && (
            <p className="mt-2 text-xs font-mono text-amplifi-risk-medium">
              Bitcoin staking pools are currently unavailable on Sepolia. You can still stake any supported token below.
            </p>
          )}
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
              Connect your Starknet wallet (browser extension, e.g. ArgentX or Braavos) to stake.
            </p>
          )}
        </div>
      </div>

      {(error || stakeError || toastMessage) && (
        <div className="relative mb-4 sm:mb-6 rounded-amplifi border border-amplifi-risk-hard/30 bg-amplifi-risk-hard-bg/30 px-3 py-2.5 sm:px-4 sm:py-3">
          {error && <p className="text-sm text-amplifi-risk-hard">{error}</p>}
          {stakeError && <p className="text-sm text-amplifi-risk-hard">{stakeError}</p>}
          {toastMessage && (
            <p className={toastMessage.type === "error" ? "text-sm text-amplifi-risk-hard" : "text-sm text-amplifi-risk-medium"}>
              {toastMessage.text}
            </p>
          )}
        </div>
      )}

      <div className="relative grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-[472px_1fr]">
        {/* Left column: form */}
        <div className="w-full min-w-0 space-y-4 sm:space-y-6">
          <div className="rounded-amplifi bg-white p-4 sm:p-6">
            <div className="mb-4 sm:mb-5 flex items-center gap-2">
              <img src={LOGOS.import} alt="" className="h-4 w-4 text-amplifi-text" />
              <span className="text-base font-medium text-amplifi-text">Pool Selection</span>
            </div>

            <div className="space-y-3 sm:space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-amplifi-muted">Validator</label>
                <ScrollableSelect
                  value={selectedValidatorAddress}
                  onChange={setSelectedValidatorAddress}
                  options={validators.map((v) => ({
                    value: v.stakerAddress,
                    label: v.name,
                  }))}
                  placeholder="Select validator"
                  disabled={loading}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-amplifi-muted">Stakeable Token</label>
                <ScrollableSelect
                  value={selectedTokenAddress}
                  onChange={setSelectedTokenAddress}
                  options={tokens.map((t) => ({
                    value: t.address,
                    label: t.symbol,
                  }))}
                  placeholder="Select token"
                  disabled={loading}
                />
              </div>

              <p className="text-xs text-amplifi-muted">
                Available pools: {pools.length}
              </p>
            </div>
          </div>

          <div className="rounded-amplifi bg-white p-4 sm:p-6">
            <div className="mb-4 sm:mb-5 flex items-center gap-2">
              <img src={LOGOS.export} alt="" className="h-4 w-4 text-amplifi-text" />
              <span className="text-base font-medium text-amplifi-text">Stake</span>
            </div>

            <div className="space-y-3 sm:space-y-4">
              <div>
                <p className="text-xs font-medium text-amplifi-muted">{selectedTokenSymbol} Balance</p>
                <p className="text-2xl font-semibold text-amplifi-amount">
                  {displayBalance != null ? `${displayBalance} ${selectedTokenSymbol}` : "—"}
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-amplifi-muted">
                  Amount ({selectedTokenSymbol})
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

              {selectedPool && (
                <p className="text-xs text-amplifi-muted break-all">
                  Pool:{" "}
                  <a
                    href={getAddressExplorerUrl(selectedPool.poolContract)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-amplifi-primary underline hover:text-amplifi-primary-hover"
                  >
                    {selectedPool.poolContract}
                  </a>
                </p>
              )}

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

        {/* Right column: pools list */}
        <div className="w-full min-w-0">
          <EarnPoolsPanel
            pools={pools}
            selectedPool={selectedPool}
            selectedToken={selectedToken}
            loading={loading}
          />
        </div>
      </div>
    </div>
  );
}

function EarnPoolsPanel({
  pools,
  selectedPool,
  selectedToken,
  loading,
}: {
  pools: Pool[];
  selectedPool: Pool | null;
  selectedToken: { symbol: string; address: string } | null;
  loading: boolean;
}) {
  return (
    <section className="rounded-amplifi-lg bg-white p-4 sm:p-5 md:p-6 md:h-fit md:min-h-0">
      <p className="mb-3 sm:mb-4 flex items-center gap-2 text-base font-medium text-amplifi-text">
        <img src={LOGOS.borrow} alt="earn" className="h-5 w-5" />
        Staking Pools
      </p>
      {loading ? (
        <p className="text-sm text-amplifi-muted">Loading pools…</p>
      ) : pools.length === 0 ? (
        <p className="text-sm text-amplifi-muted">Select a validator to see pools.</p>
      ) : (
        <ul className="space-y-0">
          {pools.map((pool) => {
            const isSelected = selectedPool?.poolContract === pool.poolContract;
            return (
              <li
                key={pool.poolContract}
                className={`flex flex-col gap-2 sm:gap-3 border-b border-amplifi-border py-3 sm:py-4 last:border-b-0 ${isSelected ? "rounded-amplifi bg-amplifi-best-offer/50" : ""}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amplifi-primary text-sm font-semibold text-white">
                      {pool.token.symbol?.charAt(0) ?? "?"}
                    </div>
                    <span className="text-sm font-medium text-amplifi-text">
                      {pool.token.symbol}
                    </span>
                    {isSelected && selectedToken && (
                      <span className="rounded-[4px] bg-amplifi-best-offer px-1.5 py-0.5 text-sm font-normal text-amplifi-best-offer-text">
                        In use
                      </span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-amplifi-muted">Token</p>
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-amplifi-text">
                      <img
                        src={getAssetIconUrl(pool.token.symbol)}
                        alt=""
                        className="h-4 w-4 rounded-full"
                      />
                      {pool.token.symbol}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-amplifi-muted">Pool contract</p>
                    <a
                      href={getAddressExplorerUrl(pool.poolContract)}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-sm font-medium text-amplifi-primary underline hover:text-amplifi-primary-hover"
                    >
                      {pool.poolContract}
                    </a>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
