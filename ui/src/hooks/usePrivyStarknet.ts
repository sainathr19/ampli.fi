"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { StarkSDK, OnboardStrategy } from "starkzap";
import type { WalletInterface } from "starkzap";
import { StarknetSigner } from "@atomiqlabs/chain-starknet";
import { API_URL, NETWORK, STORAGE_KEYS } from "@/lib/constants";

export interface UsePrivyStarknetResult {
  wallet: WalletInterface | null;
  walletAddress: string | null;
  starknetSigner: StarknetSigner | null;
  isAuthenticated: boolean;
  isReady: boolean;
  isLoading: boolean;
  error: string | null;
  login: () => void;
  logout: () => Promise<void>;
}

export function usePrivyStarknet(): UsePrivyStarknetResult {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();
  const [wallet, setWallet] = useState<WalletInterface | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [starknetSigner, setStarknetSigner] = useState<StarknetSigner | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setupAttemptedRef = useRef(false);

  const handleLogout = useCallback(async () => {
    try {
      Object.values(STORAGE_KEYS).forEach((k) => {
        try {
          window.localStorage.removeItem(k);
        } catch {
          // ignore
        }
      });
    } catch {
      // ignore
    }
    setWallet(null);
    setWalletAddress(null);
    setStarknetSigner(null);
    setupAttemptedRef.current = false;
    try {
      await logout();
    } catch {
      // ignore
    }
  }, [logout]);

  useEffect(() => {
    if (!ready || !authenticated || !user?.id) return;
    if (wallet) return;
    if (setupAttemptedRef.current || isLoading) return;
    setupAttemptedRef.current = true;

    const setupWallet = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const storedUser = window.localStorage.getItem(STORAGE_KEYS.userId);
        if (storedUser && storedUser !== user.id) {
          window.localStorage.removeItem(STORAGE_KEYS.walletId);
          window.localStorage.removeItem(STORAGE_KEYS.walletAddress);
          window.localStorage.removeItem(STORAGE_KEYS.publicKey);
        }
        window.localStorage.setItem(STORAGE_KEYS.userId, user.id);

        let wId = window.localStorage.getItem(STORAGE_KEYS.walletId);
        let wPk = window.localStorage.getItem(STORAGE_KEYS.publicKey);

        if (!wId || !wPk) {
          const token = await getAccessToken();
          const resp = await fetch(`${API_URL}/api/wallet/starknet`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          });
          const data = await resp.json().catch(() => ({}));
          if (!resp.ok) throw new Error(data?.error || "Create wallet failed");
          const w = data.wallet || {};
          wId = w.id ?? null;
          wPk = w.publicKey ?? w.public_key ?? null;
          if (wId) window.localStorage.setItem(STORAGE_KEYS.walletId, wId);
          if (wPk) window.localStorage.setItem(STORAGE_KEYS.publicKey, wPk);
        }

        if (!wId || !wPk) throw new Error("Failed to get wallet credentials");

        const sdk = new StarkSDK({
          network: NETWORK === "mainnet" ? "mainnet" : "sepolia",
          paymaster: { nodeUrl: `${API_URL}/api/paymaster` },
        });

        const { wallet: sdkWallet } = await sdk.onboard({
          strategy: OnboardStrategy.Privy,
          deploy: "if_needed",
          feeMode: "sponsored",
          privy: {
            resolve: async () => ({
              walletId: wId!,
              publicKey: wPk!,
              serverUrl: `${API_URL}/api/wallet/sign`,
            }),
          },
        });

        const addr = sdkWallet.address;
        setWallet(sdkWallet);
        setWalletAddress(addr);
        if (addr) window.localStorage.setItem(STORAGE_KEYS.walletAddress, addr);

        if (typeof sdkWallet.getAccount === "function") {
          try {
            const account = sdkWallet.getAccount();
            const signer = new StarknetSigner(account);
            setStarknetSigner(signer);
          } catch (e) {
            console.warn("[PrivyStarknet] Could not create StarknetSigner:", e);
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Wallet setup failed";
        console.error("[usePrivyStarknet] Error:", msg);
        setError(msg);
      } finally {
        setIsLoading(false);
      }
    };

    void setupWallet();
  }, [ready, authenticated, user?.id, wallet, isLoading, getAccessToken]);

  return {
    wallet,
    walletAddress,
    starknetSigner,
    isAuthenticated: authenticated,
    isReady: authenticated && !!wallet,
    isLoading,
    error,
    login,
    logout: handleLogout,
  };
}
