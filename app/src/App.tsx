import { useEffect } from "react";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import WalletConnectionModal from "@/components/ui/WalletConnectionModal";
import { PrivyStarknetSync } from "@/components/PrivyStarknetSync";
import { WalletReconnector } from "@/components/WalletReconnector";
import { useWallet } from "@/store/useWallet";
import { Navbar } from "@/components/navbar";
import { ChainDataProvider } from "@/context/ChainDataProvider";
import { ConnectModalProvider, useConnectModal } from "@/context/ConnectModalContext";
import {
  BorrowLayout,
  BorrowHomePage,
  BorrowOfferPage,
  BorrowInitiatePage,
} from "@/pages/borrow";
import { HistoryPage, OrderDetailPage } from "@/pages/history";
import { SwapPage } from "@/pages/swap";
import { EarnPage } from "@/components/earn";

function AppContent() {
  const { detectProviders } = useWallet();
  const { isOpen, open, close } = useConnectModal();

  useEffect(() => {
    detectProviders();
  }, [detectProviders]);

  return (
    <>
      <WalletReconnector />
      <PrivyStarknetSync />
      <div className="flex h-screen min-h-0 flex-col min-w-0 overflow-x-hidden px-4 sm:px-6 lg:px-10">
        <Navbar onOpenConnect={open} />

        <main className="min-h-0 flex-1 overflow-auto bg-amplifi-surface">
          <Routes>
            <Route path="/" element={<RedirectToBorrow />} />
            <Route path="/borrow" element={<BorrowLayout />}>
              <Route index element={<BorrowHomePage />} />
            <Route path="offer" element={<BorrowOfferPage />} />
            <Route path="initiate/:orderId" element={<BorrowInitiatePage />} />
            <Route path="order/:orderId" element={<BorrowInitiatePage />} />
            </Route>
            <Route path="/earn" element={<EarnPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/history/:orderId" element={<OrderDetailPage />} />
            <Route path="/swap" element={<SwapPage />} />
          </Routes>
        </main>
      </div>

      <WalletConnectionModal isOpen={isOpen} onClose={close} />
    </>
  );
}

function RedirectToBorrow() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/borrow", { replace: true });
  }, [navigate]);
  return null;
}

function AppWithConnectModal() {
  return (
    <ConnectModalProvider>
      <AppContent />
    </ConnectModalProvider>
  );
}

export default function App() {
  return (
    <ChainDataProvider>
      <TooltipPrimitive.Provider delayDuration={200}>
        <BrowserRouter>
          <AppWithConnectModal />
        </BrowserRouter>
      </TooltipPrimitive.Provider>
    </ChainDataProvider>
  );
}
