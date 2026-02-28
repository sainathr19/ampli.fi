import { useEffect, useState } from "react";
import WalletConnectionModal from "@/components/ui/WalletConnectionModal";
import { PrivyStarknetSync } from "@/components/PrivyStarknetSync";
import { useWallet } from "@/store/useWallet";
import { AtomiqSwap } from "@/components/swap/AtomiqSwap";

function short(addr?: string | null, leading = 6, trailing = 4) {
  if (!addr) return "";
  if (addr.length <= leading + trailing + 3) return addr;
  return `${addr.slice(0, leading)}...${addr.slice(-trailing)}`;
}

export default function App() {
  const [modalOpen, setModalOpen] = useState(false);
  const {
    isConnecting,
    connected,
    bitcoinPaymentAddress,
    starknetAddress,
    detectProviders,
  } = useWallet();

  useEffect(() => {
    detectProviders();
  }, [detectProviders]);

  const displayAddress = bitcoinPaymentAddress || starknetAddress;

  return (
    <>
      <PrivyStarknetSync />
      <nav
        className="border-b px-4 py-3"
        style={{
          backgroundColor: "var(--amplifi-surface)",
          borderColor: "var(--amplifi-border)",
        }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <span
            className="text-lg font-medium"
            style={{ color: "var(--amplifi-text)" }}
          >
            AmpliFi
          </span>
          <div>
            {!connected ? (
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                disabled={isConnecting}
                className="btn-primary rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
              >
                {isConnecting ? "Connecting…" : "Connect Wallet"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="rounded-lg border px-3 py-2 text-sm transition-colors hover:opacity-90"
                style={{
                  borderColor: "var(--amplifi-border)",
                  backgroundColor: "var(--amplifi-surface)",
                  color: "var(--amplifi-text)",
                }}
              >
                {short(displayAddress)}
              </button>
            )}
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-2xl px-4 py-8">
        <AtomiqSwap />
      </main>

      <WalletConnectionModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
}
