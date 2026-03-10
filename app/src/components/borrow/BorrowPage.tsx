import { useState, useCallback } from "react";
import { SigHash, Transaction } from "@scure/btc-signer";
import { SupplyBorrowForm } from "./SupplyBorrowForm";
import { BorrowOffers } from "./BorrowOffers";
import {
  createBridgeOrder,
  submitBridgeOrder,
  type LoanOfferItem,
  type BridgeOrderPayment,
  type PaymentAddress,
  type PaymentFundedPsbt,
  type PaymentRawPsbt,
} from "@/lib/amplifi-api";
import { broadcastBtcTx } from "@/lib/btc-broadcast";
import { useWallet } from "@/store/useWallet";

export interface LoanFlowState {
  orderId: string;
  depositAddress?: string;
  amountSats?: string;
  /** PSBT flow: when present, user must sign this PSBT */
  payment?: BridgeOrderPayment;
}

/**
 * Prepares a RAW_PSBT for Taproot signing (e.g. Xverse needs tapInternalKey).
 * For FUNDED_PSBT this may not be needed; we apply it for RAW_PSBT when wallet has pubkey.
 */
function prepareRawPsbtForSigning(
  psbt: Transaction,
  inputIdx: number,
  wallet: { publicKey: string }
): void {
  const pubkeyHex = wallet.publicKey;
  if (!pubkeyHex || pubkeyHex.length < 64) return;
  const xOnlyHex =
    pubkeyHex.length === 66 ? pubkeyHex.slice(2) : pubkeyHex.slice(0, 64);
  const tapInternalKey = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    tapInternalKey[i] = parseInt(xOnlyHex.slice(i * 2, i * 2 + 2), 16);
  }
  psbt.updateInput(inputIdx, {
    tapInternalKey,
    sighashType: SigHash.DEFAULT,
  });
  const tx = psbt as unknown as { inputs: Record<string, unknown>[] };
  if (tx.inputs?.[inputIdx]?.tapBip32Derivation) {
    delete tx.inputs[inputIdx].tapBip32Derivation;
  }
}

async function signAndBroadcastPsbt(
  psbtBase64: string,
  signInputs: number[] | undefined,
  wallet: { signPsbt: (psbt: Transaction, inputs: number[]) => Promise<Transaction> },
  isRawPsbt: boolean
): Promise<{ txId: string; signedPsbtBase64: string }> {
  const psbt = Transaction.fromPSBT(Buffer.from(psbtBase64, "base64"));
  const inputsToSign =
    signInputs && signInputs.length > 0
      ? signInputs
      : Array.from({ length: psbt.inputsLength }, (_, i) => i);
  if (isRawPsbt && "publicKey" in wallet) {
    for (const idx of inputsToSign) {
      prepareRawPsbtForSigning(psbt, idx, wallet as { publicKey: string });
    }
  }
  const signed = await wallet.signPsbt(psbt, inputsToSign);
  signed.finalize();
  const signedPsbtBase64 = Buffer.from(signed.toPSBT(0)).toString("base64");
  const txHex = Buffer.from(signed.extract()).toString("hex");
  const txId = await broadcastBtcTx(txHex);
  return { txId, signedPsbtBase64 };
}

export function BorrowPage() {
  const [loanParams, setLoanParams] = useState({
    borrowUsd: 1000,
    targetLtv: 0.5,
  });
  const [selectedOffer, setSelectedOffer] = useState<{
    item: LoanOfferItem;
    isBest: boolean;
  } | null>(null);
  const [loanFlow, setLoanFlow] = useState<LoanFlowState | null>(null);
  const [initiateError, setInitiateError] = useState<string | null>(null);
  const [isSendingBtc, setIsSendingBtc] = useState(false);
  const {
    starknetAddress,
    bitcoinWalletInstance,
    bitcoinPaymentAddress,
    bitcoinWalletType,
    connectBitcoin,
  } = useWallet();

  const onLoanParamsChange = useCallback((borrowUsd: number, targetLtv: number) => {
    setLoanParams((prev) =>
      prev.borrowUsd === borrowUsd && prev.targetLtv === targetLtv
        ? prev
        : { borrowUsd, targetLtv }
    );
  }, []);

  const handleInitiateLoan = useCallback(
    async (params: {
      btcEquivalent: number;
      supplyAmountUsd: number;
      borrowAmountUsd: number;
    }) => {
      if (!starknetAddress || !selectedOffer) {
        setInitiateError("Connect your Starknet wallet first");
        return;
      }
      setInitiateError(null);

      const sats = Math.floor(params.btcEquivalent * 100_000_000);
      if (sats <= 0) {
        setInitiateError("Invalid collateral amount");
        return;
      }

      const collateralSymbol = selectedOffer.item.data.collateral.symbol;
      const destinationAsset =
        collateralSymbol === "WBTC"
          ? "WBTC"
          : collateralSymbol === "BTC"
            ? "WBTC"
            : "WBTC";

      try {
        let wallet = bitcoinWalletInstance;
        if (!wallet && bitcoinWalletType) {
          try {
            await connectBitcoin(bitcoinWalletType);
            wallet = useWallet.getState().bitcoinWalletInstance;
          } catch {
            // Continue without Option A; backend may return RAW_PSBT or ADDRESS
          }
        }
        const optionA =
          bitcoinPaymentAddress &&
          wallet &&
          "publicKey" in wallet &&
          typeof (wallet as { publicKey: string }).publicKey === "string"
            ? {
                bitcoinPaymentAddress,
                bitcoinPublicKey: (wallet as { publicKey: string }).publicKey,
              }
            : {};
        const { data: created } = await createBridgeOrder({
          sourceAsset: "BTC",
          destinationAsset,
          amount: String(sats),
          amountType: "exactIn",
          receiveAddress: starknetAddress,
          walletAddress: starknetAddress,
          ...optionA,
        });

        const payment = created.payment;
        const depositAddress =
          payment?.type === "ADDRESS"
            ? (payment as PaymentAddress).address
            : created.depositAddress ?? created.quote?.depositAddress;
        const amountSats =
          payment?.type === "ADDRESS"
            ? (payment as PaymentAddress).amountSats
            : created.amountSats ?? created.quote?.amountIn ?? String(sats);

        setLoanFlow({
          orderId: created.orderId,
          depositAddress,
          amountSats,
          payment,
        });

        if (!payment) {
          // Legacy: ADDRESS flow (depositAddress + amountSats)
          if (bitcoinWalletInstance && depositAddress && amountSats) {
            setIsSendingBtc(true);
            try {
              await bitcoinWalletInstance.sendTransaction(
                depositAddress,
                BigInt(amountSats)
              );
            } catch (sendErr) {
              if (
                sendErr instanceof Error &&
                !sendErr.message?.toLowerCase().includes("cancel")
              ) {
                setInitiateError(sendErr.message);
              }
            } finally {
              setIsSendingBtc(false);
            }
          }
          return;
        }

        if (payment.type === "ADDRESS") {
          if (bitcoinWalletInstance && depositAddress && amountSats) {
            setIsSendingBtc(true);
            try {
              await bitcoinWalletInstance.sendTransaction(
                depositAddress,
                BigInt(amountSats)
              );
            } catch (sendErr) {
              if (
                sendErr instanceof Error &&
                !sendErr.message?.toLowerCase().includes("cancel")
              ) {
                setInitiateError(sendErr.message);
              }
            } finally {
              setIsSendingBtc(false);
            }
          }
          return;
        }

        // FUNDED_PSBT or RAW_PSBT
        const psbtPayment = payment as PaymentFundedPsbt | PaymentRawPsbt;
        const psbtBase64 =
          psbtPayment.psbtBase64 ??
          (psbtPayment.psbtHex
            ? Buffer.from(psbtPayment.psbtHex, "hex").toString("base64")
            : null);
        if (!psbtBase64) {
          setInitiateError("No PSBT data in order response");
          return;
        }

        if (!wallet && bitcoinWalletType) {
          try {
            await connectBitcoin(bitcoinWalletType);
            wallet = useWallet.getState().bitcoinWalletInstance;
          } catch {
            setInitiateError("Reconnect your Bitcoin wallet to sign");
          }
        }

        if (wallet) {
          setIsSendingBtc(true);
          try {
            const { txId, signedPsbtBase64 } = await signAndBroadcastPsbt(
              psbtBase64,
              psbtPayment.signInputs,
              wallet,
              payment.type === "RAW_PSBT"
            );
            await submitBridgeOrder(created.orderId, {
              signedPsbtBase64,
              sourceTxId: txId,
            });
          } catch (sendErr) {
            if (
              sendErr instanceof Error &&
              !sendErr.message?.toLowerCase().includes("cancel")
            ) {
              const msg = sendErr.message;
              const isSignOrBroadcast =
                msg.toLowerCase().includes("sign") ||
                msg.toLowerCase().includes("broadcast") ||
                msg.toLowerCase().includes("taproot") ||
                msg.toLowerCase().includes("transaction");
              setInitiateError(
                isSignOrBroadcast
                  ? `${msg} The PSBT may be underfunded: the backend must select UTXOs with sufficient balance. Ensure your Bitcoin wallet is connected before initiating and has at least the deposit amount (${amountSats} sats).`
                  : msg
              );
            }
          } finally {
            setIsSendingBtc(false);
          }
        }
      } catch (e) {
        setInitiateError(e instanceof Error ? e.message : "Failed to initiate loan");
      }
    },
    [
      starknetAddress,
      selectedOffer,
      bitcoinWalletInstance,
      bitcoinPaymentAddress,
      bitcoinWalletType,
      connectBitcoin,
    ]
  );

  const handleSignPsbt = useCallback(
    async (orderId: string, payment: PaymentFundedPsbt | PaymentRawPsbt) => {
      let wallet = bitcoinWalletInstance;
      if (!wallet && bitcoinWalletType) {
        try {
          await connectBitcoin(bitcoinWalletType);
          wallet = useWallet.getState().bitcoinWalletInstance;
        } catch {
          setInitiateError("Reconnect your Bitcoin wallet to sign");
          return;
        }
      }
      if (!wallet) {
        setInitiateError("Connect your Bitcoin wallet to sign the transaction");
        return;
      }
      const psbtBase64 =
        payment.psbtBase64 ??
        (payment.psbtHex
          ? Buffer.from(payment.psbtHex, "hex").toString("base64")
          : null);
      if (!psbtBase64) {
        setInitiateError("No PSBT data");
        return;
      }
      setIsSendingBtc(true);
      setInitiateError(null);
      try {
        const { txId, signedPsbtBase64 } = await signAndBroadcastPsbt(
          psbtBase64,
          payment.signInputs,
          wallet,
          payment.type === "RAW_PSBT"
        );
        await submitBridgeOrder(orderId, {
          signedPsbtBase64,
          sourceTxId: txId,
        });
      } catch (e) {
        if (
          e instanceof Error &&
          !e.message?.toLowerCase().includes("cancel")
        ) {
          const msg = e.message;
          const isSignOrBroadcast =
            msg.toLowerCase().includes("sign") ||
            msg.toLowerCase().includes("broadcast") ||
            msg.toLowerCase().includes("taproot") ||
            msg.toLowerCase().includes("transaction");
          setInitiateError(
            isSignOrBroadcast
              ? `${msg} The PSBT may be underfunded. Ensure your Bitcoin wallet is connected before initiating and has sufficient balance.`
              : msg
          );
        }
      } finally {
        setIsSendingBtc(false);
      }
    },
    [bitcoinWalletInstance, bitcoinWalletType, connectBitcoin]
  );

  return (
    <div className="relative mx-auto w-full max-w-[1400px] min-w-0 py-6 px-4 sm:py-8 sm:px-0">
      {/* Left-side background pattern */}
      <div
        className="pointer-events-none absolute left-0 top-0 bottom-0 w-full max-w-[50%] min-h-[600px] bg-no-repeat bg-left bg-[length:auto_100%] opacity-[0.06] lg:opacity-[0.08]"
        style={{ backgroundImage: "url('/mask.svg')" }}
        aria-hidden
      />
        <div className="relative mb-8 flex flex-col gap-4 sm:mb-10 sm:flex-row sm:gap-20 lg:gap-20">
          <p className="text-2xl font-semibold tracking-tight md:text-3xl">
            Borrow
          </p>
          <p className="mt-0 sm:mt-2 text-sm sm:text-base leading-relaxed text-amplifi-text max-w-[899px]">
            Borrow against your BTC. Deposit BTC, and we automatically swap and
            route it into the required collateral pool. Receive your loan
            instantly. Repay anytime to unlock and withdraw your BTC.
          </p>
        </div>
      <div className="relative grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-[472px_1fr]">
        <div className="w-full min-w-0">
          <SupplyBorrowForm
            onLoanParamsChange={onLoanParamsChange}
            selectedOffer={selectedOffer}
            onInitiateLoan={handleInitiateLoan}
            initiateError={initiateError}
            starknetAddress={starknetAddress}
            loanFlow={loanFlow}
          />
        </div>
        <div className="w-full min-w-0">
          <BorrowOffers
            borrowUsd={loanParams.borrowUsd}
            targetLtv={loanParams.targetLtv}
            selectedOffer={selectedOffer}
            onSelectOffer={setSelectedOffer}
            loanFlow={loanFlow}
            isSendingBtc={isSendingBtc}
            onSignPsbt={handleSignPsbt}
          />
        </div>
      </div>
    </div>
  );
}
