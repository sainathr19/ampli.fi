import { useEffect, useState, useCallback, useRef } from "react";
import { BitcoinNetwork } from "@atomiqlabs/sdk";
import { RPC_URL } from "@/lib/constants";
import {
  initSwapper,
  stopSwapper,
  createSwap,
  sendBtcTransaction,
  waitForBtcConfirmation,
  claimOrWaitForWatchtower,
  type DstToken,
  type SwapHandle,
} from "@/lib/atomiq/swapService";
import {
  createOrder,
  updateAtomiqSwapId,
  updateBtcTxHash,
  updateOrderStatus,
} from "@/lib/amplifi-api";
import { useWallet } from "@/store/useWallet";

export type SwapStep =
  | "idle"
  | "creating_order"
  | "creating_swap"
  | "sending_btc"
  | "confirming_btc"
  | "claiming"
  | "settled"
  | "error";

export interface UseAtomiqSwapResult {
  isInitialized: boolean;
  isInitializing: boolean;
  step: SwapStep;
  logs: string[];
  lastSwapId: string | null;
  lastOrderId: string | null;
  runSwap: (params: {
    dstToken: DstToken;
    amountBtc: string;
    action?: "swap" | "borrow" | "stake";
    destinationAsset?: string;
  }) => Promise<string | null>;
  clearLogs: () => void;
}

export function useAtomiqSwap(): UseAtomiqSwapResult {
  const {
    connected,
    bitcoinPaymentAddress,
    starknetAddress,
    bitcoinWalletInstance,
    starknetSigner,
  } = useWallet();

  const [isInitialized, setIsInitialized] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [step, setStep] = useState<SwapStep>("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [lastSwapId, setLastSwapId] = useState<string | null>(null);
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const log = useCallback((line: string) => {
    if (mountedRef.current) {
      setLogs((l) => [...l, line]);
    }
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  // Initialize swapper on mount
  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    (async () => {
      setIsInitializing(true);
      try {
        await initSwapper(BitcoinNetwork.TESTNET4, RPC_URL);
        if (!cancelled) {
          setIsInitialized(true);
          log("Swapper ready (BTC: Testnet4, Starknet: Sepolia)");
        }
      } catch (e) {
        if (!cancelled) {
          log("Init failed: " + (e instanceof Error ? e.message : String(e)));
        }
      } finally {
        if (!cancelled) setIsInitializing(false);
      }
    })();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      void stopSwapper();
    };
  }, [log]);

  const runSwap = useCallback(
    async (params: {
      dstToken: DstToken;
      amountBtc: string;
      action?: "swap" | "borrow" | "stake";
      destinationAsset?: string;
    }): Promise<string | null> => {
      if (!connected || !bitcoinPaymentAddress || !starknetAddress || !bitcoinWalletInstance || !starknetSigner) {
        const msg = "Connect both Bitcoin and Starknet wallets first.";
        log(msg);
        throw new Error(msg);
      }
      if (!params.amountBtc || Number(params.amountBtc) <= 0) {
        const msg = "Enter a valid amount (BTC).";
        log(msg);
        throw new Error(msg);
      }

      const action = params.action ?? "swap";
      const destAsset = params.destinationAsset ?? params.dstToken;
      let orderId: string | null = null;
      let handle: SwapHandle | null = null;

      try {
        // Step 1: Create tracking order on backend
        setStep("creating_order");
        log("Creating order...");
        const amountSats = BigInt(Math.floor(Number(params.amountBtc) * 1e8));

        const orderResp = await createOrder({
          sourceAsset: "BTC",
          destinationAsset: destAsset,
          amount: amountSats.toString(),
          amountType: "exactIn",
          receiveAddress: starknetAddress,
          walletAddress: starknetAddress,
          bitcoinAddress: bitcoinPaymentAddress,
          action,
        });
        orderId = orderResp.data.orderId;
        setLastOrderId(orderId);
        log("Order created: " + orderId);

        // Step 2: Create atomiq swap on frontend
        setStep("creating_swap");
        log(`Creating swap: ${amountSats.toString()} sats → ${params.dstToken}`);
        log(`  BTC address: ${bitcoinPaymentAddress}`);
        log(`  Starknet address: ${starknetAddress}`);

        const result = await createSwap({
          dstToken: params.dstToken,
          amountSats,
          exactIn: true,
          bitcoinAddress: bitcoinPaymentAddress,
          starknetAddress,
          onStateChange: (state) => log("State: " + state),
        });

        handle = result.handle;
        const swapQuote = result.quote;
        setLastSwapId(swapQuote.swapId);
        log("Swap created: " + swapQuote.swapId);
        log("  Input (no fee): " + swapQuote.inputWithoutFee.toString() + " sats");
        log("  Fees: " + swapQuote.fees.toString() + " sats");
        for (const fee of swapQuote.feeBreakdown) {
          log("    - " + fee.type + ": " + fee.amount.toString() + " sats");
        }
        log("  Input (with fees): " + swapQuote.inputWithFees.toString() + " sats");
        log("  Output: " + swapQuote.output);

        // Link atomiq swap ID to backend order
        await updateAtomiqSwapId(orderId, swapQuote.swapId).catch((e) => log("API update failed: " + (e instanceof Error ? e.message : String(e))));

        // Step 3: Send BTC transaction
        setStep("sending_btc");
        log("Sending BTC transaction...");
        const btcTxHash = await sendBtcTransaction(handle, bitcoinWalletInstance);
        log("BTC tx sent: " + (btcTxHash || "(broadcast)"));

        // Link BTC tx hash to backend order
        if (btcTxHash) {
          await updateBtcTxHash(orderId, btcTxHash).catch((e) => log("API update failed: " + (e instanceof Error ? e.message : String(e))));
        }

        // Step 4: Wait for BTC confirmation
        setStep("confirming_btc");
        log("Waiting for BTC confirmation...");
        await waitForBtcConfirmation(handle, 1, (txId, current, target, etaMs) => {
          log(`  ${txId} (${current}/${target}) ETA: ${Math.floor(etaMs / 1000)}s`);
        });
        log("BTC confirmed!");

        await updateOrderStatus(orderId, "BTC_CONFIRMED").catch((e) => log("API update failed: " + (e instanceof Error ? e.message : String(e))));

        // Step 5: Claim
        setStep("claiming");
        log("Waiting for claim...");
        await updateOrderStatus(orderId, "CLAIMING").catch((e) => log("API update failed: " + (e instanceof Error ? e.message : String(e))));

        const claimResult = await claimOrWaitForWatchtower(handle, starknetSigner);
        log(
          claimResult.claimedBy === "watchtower"
            ? "Claimed by watchtower."
            : "Claimed manually."
        );

        // Step 6: Settled
        setStep("settled");
        await updateOrderStatus(orderId, "SETTLED").catch((e) => log("API update failed: " + (e instanceof Error ? e.message : String(e))));
        log("Swap complete!");
        return orderId;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log("Error: " + msg);
        console.error("Swap error:", e);
        setStep("error");

        if (orderId) {
          await updateOrderStatus(orderId, "FAILED", { lastError: msg }).catch((err) => log("API update failed: " + (err instanceof Error ? err.message : String(err))));
        }
        return null;
      }
    },
    [connected, bitcoinPaymentAddress, starknetAddress, bitcoinWalletInstance, starknetSigner, log]
  );

  return {
    isInitialized,
    isInitializing,
    step,
    logs,
    lastSwapId,
    lastOrderId,
    runSwap,
    clearLogs,
  };
}
