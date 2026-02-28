import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useWallet } from "@/store/useWallet";

interface WalletConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function WalletConnectionModal({
  isOpen,
  onClose,
}: WalletConnectionModalProps) {
  const [mounted, setMounted] = useState(false);
  const {
    bitcoinPaymentAddress,
    starknetAddress,
    connected,
    isXverseAvailable,
    isUniSatAvailable,
    connectBitcoin,
    connectStarknet,
    disconnectBitcoin,
    disconnectStarknet,
    isConnecting,
  } = useWallet();

  const [connectingXverse, setConnectingXverse] = useState(false);
  const [connectingUnisat, setConnectingUnisat] = useState(false);
  const [connectingStarknet, setConnectingStarknet] = useState(false);
  const [disconnectingAll, setDisconnectingAll] = useState(false);

  useEffect(() => {
    setMounted(typeof document !== "undefined");
  }, []);

  const onBitcoinConnect = async (walletType: "xverse" | "unisat") => {
    if (walletType === "xverse") setConnectingXverse(true);
    else setConnectingUnisat(true);
    try {
      await connectBitcoin(walletType);
    } catch (e) {
      console.error(e);
    } finally {
      if (walletType === "xverse") setConnectingXverse(false);
      else setConnectingUnisat(false);
    }
  };

  const onStarknetConnect = async () => {
    setConnectingStarknet(true);
    try {
      await connectStarknet();
    } catch (e) {
      console.error(e);
    } finally {
      setConnectingStarknet(false);
    }
  };

  const onDisconnectAll = async () => {
    setDisconnectingAll(true);
    try {
      if (bitcoinPaymentAddress) disconnectBitcoin();
      if (starknetAddress) await disconnectStarknet();
    } catch (e) {
      console.error(e);
    } finally {
      setDisconnectingAll(false);
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="connect-wallets-title"
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        style={{ backgroundColor: "var(--amplifi-overlay)" }}
        aria-hidden
        onClick={onClose}
      />
      <div
        className="relative z-10 w-full max-w-md rounded-xl border bg-white p-6 shadow-xl"
        style={{
          backgroundColor: "var(--amplifi-surface)",
          borderColor: "var(--amplifi-border)",
          borderRadius: "var(--amplifi-radius)",
          boxShadow: "var(--amplifi-shadow)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="connect-wallets-title" className="text-lg font-semibold" style={{ color: "var(--amplifi-text)" }}>
            Connect Wallets
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 transition-colors hover:bg-gray-100"
            style={{ color: "var(--amplifi-text-muted)" }}
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mb-4 rounded-lg border p-3 text-xs" style={{ borderColor: "var(--amplifi-border)", color: "var(--amplifi-text-muted)" }}>
          <div className="font-medium" style={{ color: "var(--amplifi-text)" }}>Networks</div>
          <div>Bitcoin: Testnet4 · Starknet: Sepolia</div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border p-3" style={{ borderColor: "var(--amplifi-border)" }}>
            <div className="mb-2 text-sm font-medium" style={{ color: "var(--amplifi-text)" }}>Bitcoin</div>
            {bitcoinPaymentAddress ? (
              <div>
                <div className="mb-1 text-xs" style={{ color: "var(--amplifi-text-muted)" }}>Connected</div>
                <div className="break-all rounded bg-gray-100 p-2 text-xs font-mono" style={{ color: "var(--amplifi-text)" }}>
                  {bitcoinPaymentAddress}
                </div>
                <button
                  type="button"
                  onClick={() => disconnectBitcoin()}
                  className="mt-2 text-xs text-red-600 hover:underline"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {isXverseAvailable && (
                  <button
                    type="button"
                    onClick={() => onBitcoinConnect("xverse")}
                    disabled={connectingXverse || isConnecting}
                    className="block w-full rounded-lg border px-3 py-2 text-sm transition-colors disabled:opacity-50"
                    style={{ borderColor: "var(--amplifi-border)", backgroundColor: "var(--amplifi-surface)" }}
                  >
                    {connectingXverse ? "Connecting…" : "Connect Xverse"}
                  </button>
                )}
                {isUniSatAvailable && (
                  <button
                    type="button"
                    onClick={() => onBitcoinConnect("unisat")}
                    disabled={connectingUnisat || isConnecting}
                    className="block w-full rounded-lg border px-3 py-2 text-sm transition-colors disabled:opacity-50"
                    style={{ borderColor: "var(--amplifi-border)", backgroundColor: "var(--amplifi-surface)" }}
                  >
                    {connectingUnisat ? "Connecting…" : "Connect UniSat"}
                  </button>
                )}
                {!isXverseAvailable && !isUniSatAvailable && (
                  <p className="py-2 text-xs" style={{ color: "var(--amplifi-text-muted)" }}>
                    No Bitcoin wallet detected
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="rounded-lg border p-3" style={{ borderColor: "var(--amplifi-border)" }}>
            <div className="mb-2 text-sm font-medium" style={{ color: "var(--amplifi-text)" }}>Starknet</div>
            {starknetAddress ? (
              <div>
                <div className="mb-1 text-xs" style={{ color: "var(--amplifi-text-muted)" }}>Connected</div>
                <div className="break-all rounded bg-gray-100 p-2 text-xs font-mono" style={{ color: "var(--amplifi-text)" }}>
                  {starknetAddress}
                </div>
                <button
                  type="button"
                  onClick={() => disconnectStarknet()}
                  className="mt-2 text-xs text-red-600 hover:underline"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onStarknetConnect}
                disabled={connectingStarknet || isConnecting}
                className="block w-full rounded-lg border px-3 py-2 text-sm transition-colors disabled:opacity-50"
                style={{ borderColor: "var(--amplifi-border)", backgroundColor: "var(--amplifi-surface)" }}
              >
                {connectingStarknet ? "Connecting…" : "Connect Starknet"}
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 text-xs" style={{ color: "var(--amplifi-text-muted)" }}>
          {bitcoinPaymentAddress && starknetAddress
            ? "Both wallets connected"
            : "Connect both wallets to use swap"}
        </div>

        {connected && (
          <button
            type="button"
            onClick={onDisconnectAll}
            disabled={disconnectingAll || (!bitcoinPaymentAddress && !starknetAddress)}
            className="mt-3 w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50"
          >
            {disconnectingAll ? "Disconnecting…" : "Disconnect All"}
          </button>
        )}
      </div>
    </div>
  );

  if (!mounted || typeof document === "undefined") return null;
  return createPortal(modalContent, document.body);
}
