import { useCallback, useEffect, useState } from "react";
import {
  getEndurPoolInfo,
  getEndurPosition,
  getStrkBalance,
  buildEndurDepositCalls,
  buildEndurWithdrawCalls,
  type EndurPoolInfo,
  type EndurPosition,
} from "@/lib/staking/endurClient";
import { useWallet } from "@/store/useWallet";

export interface UseEndurStakingResult {
  pool: EndurPoolInfo | null;
  position: EndurPosition | null;
  strkBalance: string | null;
  loading: boolean;
  error: string | null;
  isSubmitting: boolean;
  reload: () => Promise<void>;
  deposit: (amount: string) => Promise<string>;
  withdraw: (xstrkAmount: string) => Promise<string>;
}

export function useEndurStaking(): UseEndurStakingResult {
  const { starknetAddress, starknetAccount } =
    useWallet();
  const [pool, setPool] = useState<EndurPoolInfo | null>(null);
  const [position, setPosition] = useState<EndurPosition | null>(null);
  const [strkBalance, setStrkBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const userAddress = starknetAccount?.address ?? starknetAddress ?? null;

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const poolInfo = await getEndurPoolInfo();
      setPool(poolInfo);

      if (userAddress) {
        const [pos, balance] = await Promise.all([
          getEndurPosition(userAddress),
          getStrkBalance(userAddress),
        ]);
        setPosition(pos);
        setStrkBalance(balance);
      } else {
        setPosition(null);
        setStrkBalance(null);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load Endur data";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [userAddress]);

  useEffect(() => {
    reload();
  }, [reload]);

  const getAccount = useCallback(() => {
    if (starknetAccount) return starknetAccount;
    throw new Error("Connect your Starknet wallet to continue");
  }, [starknetAccount]);

  const deposit = useCallback(
    async (amount: string): Promise<string> => {
      if (!amount || Number(amount) <= 0) {
        throw new Error("Enter a valid deposit amount");
      }
      if (!userAddress) {
        throw new Error("Connect your Starknet wallet to continue");
      }

      setIsSubmitting(true);
      setError(null);

      try {
        const account = getAccount();
        const calls = buildEndurDepositCalls(amount, userAddress);
        const result = await account.execute(calls);
        await reload();
        return result.transaction_hash;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Deposit failed";
        setError(msg);
        throw new Error(msg);
      } finally {
        setIsSubmitting(false);
      }
    },
    [userAddress, getAccount, reload]
  );

  const withdraw = useCallback(
    async (xstrkAmount: string): Promise<string> => {
      if (!xstrkAmount || Number(xstrkAmount) <= 0) {
        throw new Error("Enter a valid withdrawal amount");
      }
      if (!userAddress) {
        throw new Error("Connect your Starknet wallet to continue");
      }

      setIsSubmitting(true);
      setError(null);

      try {
        const account = getAccount();
        const calls = buildEndurWithdrawCalls(xstrkAmount, userAddress);
        const result = await account.execute(calls);
        await reload();
        return result.transaction_hash;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Withdrawal failed";
        setError(msg);
        throw new Error(msg);
      } finally {
        setIsSubmitting(false);
      }
    },
    [userAddress, getAccount, reload]
  );

  return {
    pool,
    position,
    strkBalance,
    loading,
    error,
    isSubmitting,
    reload,
    deposit,
    withdraw,
  };
}
