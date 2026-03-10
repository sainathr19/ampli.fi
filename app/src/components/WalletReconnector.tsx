"use client";

import { useEffect, useRef } from "react";
import { useWallet } from "@/store/useWallet";

const INITIAL_DELAY_MS = 500;
const RETRY_INTERVAL_MS = 2500;
const MAX_ATTEMPTS = 4;

/**
 * WalletReconnector: Restores wallet instances on page reload when we have
 * persisted addresses/types but no live instances. Uses setInterval so the
 * timer is NOT cancelled when state changes (e.g. Starknet restore succeeding).
 */
export function WalletReconnector() {
  const { detectProviders, reconnectWallets } = useWallet();
  const attemptCount = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    detectProviders();
  }, [detectProviders]);

  useEffect(() => {
    const runReconnect = () => {
      const state = useWallet.getState();
      const needsBtcRestore = Boolean(
        state.bitcoinWalletType && !state.bitcoinWalletInstance
      );
      const needsStarknetRestore = Boolean(
        state.starknetAddress &&
          state.starknetSource === "extension" &&
          !state.starknetSigner
      );
      const needsRestore = needsBtcRestore || needsStarknetRestore;

      if (!needsRestore) return true;

      if (attemptCount.current >= MAX_ATTEMPTS) return true;

      attemptCount.current += 1;
      reconnectWallets();
      return false;
    };

    const initialTimer = setTimeout(() => {
      if (runReconnect()) return;
      intervalRef.current = setInterval(() => {
        if (runReconnect()) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      }, RETRY_INTERVAL_MS);
    }, INITIAL_DELAY_MS);

    return () => {
      clearTimeout(initialTimer);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [reconnectWallets]);

  return null;
}
