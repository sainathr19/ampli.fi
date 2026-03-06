import { useCallback, useEffect, useState } from "react";
import type { Address, Token } from "starkzap";
import { useStarkzapWallet } from "@/hooks/useStarkzapWallet";
import { parseStakeAmount } from "@/lib/staking/starkzapClient";
import { useWallet } from "@/store/useWallet";

export interface StakeResult {
  txHash: string;
  explorerUrl: string;
}

export interface UseStakeResult {
  isSubmitting: boolean;
  error: string | null;
  selectedTokenBalance: string | null;
  refreshBalance: (token: Token | null) => Promise<void>;
  stake: (params: {
    token: Token;
    poolAddress: string;
    amount: string;
  }) => Promise<StakeResult>;
}

function extractStakingErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const anyErr = err as Error & {
      shortMessage?: string;
      details?: string;
      cause?: unknown;
    };

    const direct = anyErr.shortMessage || anyErr.message || anyErr.details;
    if (direct && !direct.includes("UNKNOWN_ERROR")) {
      return direct;
    }

    if (typeof anyErr.cause === "object" && anyErr.cause !== null) {
      const cause = anyErr.cause as {
        message?: string;
        details?: string;
        shortMessage?: string;
      };
      const nested = cause.shortMessage || cause.message || cause.details;
      if (nested) return nested;
    }

    return anyErr.message || "Stake failed";
  }

  if (typeof err === "object" && err !== null) {
    const generic = err as {
      message?: string;
      shortMessage?: string;
      details?: string;
      data?: { message?: string };
    };
    return (
      generic.shortMessage ||
      generic.message ||
      generic.details ||
      generic.data?.message ||
      "Stake failed"
    );
  }

  if (typeof err === "string" && err.trim()) {
    return err;
  }

  return "Stake failed";
}

export function useStake(): UseStakeResult {
  const getStarkzapWallet = useStarkzapWallet();
  const { starknetAccount, starknetSource, privyStarkzapWallet } = useWallet();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTokenBalance, setSelectedTokenBalance] = useState<string | null>(
    null
  );

  const hasEarnWallet = Boolean(
    starknetAccount || (starknetSource === "privy" && privyStarkzapWallet != null)
  );

  const refreshBalance = useCallback(
    async (token: Token | null) => {
      if (!token) {
        setSelectedTokenBalance(null);
        return;
      }

      try {
        setError(null);
        const wallet = await getStarkzapWallet();
        const balance = await wallet.balanceOf(token);
        const formatted = balance.toUnit();
        setSelectedTokenBalance(formatted);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to fetch token balance";
        setError(message);
        setSelectedTokenBalance(null);
      }
    },
    [getStarkzapWallet]
  );

  const stake = useCallback(
    async ({
      token,
      poolAddress,
      amount,
    }: {
      token: Token;
      poolAddress: string;
      amount: string;
    }): Promise<StakeResult> => {
      if (!amount || Number(amount) <= 0) {
        throw new Error("Enter a valid staking amount");
      }

      setIsSubmitting(true);
      setError(null);

      try {
        const wallet = await getStarkzapWallet();
        const parsedAmount = parseStakeAmount(amount, token);
        const tx = await wallet.stake(poolAddress as Address, parsedAmount);
        await tx.wait();
        await refreshBalance(token);
        return { txHash: tx.hash, explorerUrl: tx.explorerUrl };
      } catch (err) {
        const message = extractStakingErrorMessage(err);
        setError(message);
        throw new Error(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [getStarkzapWallet, refreshBalance]
  );

  useEffect(() => {
    if (!hasEarnWallet) {
      setSelectedTokenBalance(null);
    }
  }, [hasEarnWallet]);

  return {
    isSubmitting,
    error,
    selectedTokenBalance,
    refreshBalance,
    stake,
  };
}
