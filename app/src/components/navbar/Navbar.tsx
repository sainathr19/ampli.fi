import { useState, useEffect } from "react";
import { LOGOS } from "@/lib/constants";
import { useWallet } from "@/store/useWallet";

export type TabId = "borrow" | "earn" | "swap";

const TABS: { id: TabId; label: string }[] = [
  { id: "borrow", label: "Borrow" },
  { id: "earn", label: "Earn" },
  { id: "swap", label: "Swap" },
];

function short(addr?: string | null, leading = 6, trailing = 4) {
  if (!addr) return "";
  if (addr.length <= leading + trailing + 3) return addr;
  return `${addr.slice(0, leading)}...${addr.slice(-trailing)}`;
}

interface NavbarProps {
  activeTab: TabId;
  setActiveTab: (id: TabId) => void;
  onOpenConnect: () => void;
}

export function Navbar({ activeTab, setActiveTab, onOpenConnect }: NavbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { isConnecting, connected, bitcoinPaymentAddress, starknetAddress } =
    useWallet();
  const displayAddress = bitcoinPaymentAddress || starknetAddress;

  // Close menu when switching to a larger viewport
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1200px)");
    const handler = () => {
      if (mq.matches) setMenuOpen(false);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Lock body scroll when menu is open
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  const handleTabSelect = (id: TabId) => {
    setActiveTab(id);
    setMenuOpen(false);
  };

  const navLinks = (
    <>
      {TABS.map(({ id, label }) => {
        const isActive = activeTab === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => handleTabSelect(id)}
            className={
              isActive
                ? "flex items-center justify-center gap-2.5 rounded-[10px] bg-amplifi-nav px-5 py-3 text-sm font-medium text-white transition-colors"
                : "flex items-center justify-center gap-2.5 px-5 py-3 text-sm font-medium text-amplifi-text transition-colors hover:text-amplifi-text"
            }
          >
            {label}
          </button>
        );
      })}
    </>
  );

  const connectButton = (
    <>
      {!connected ? (
        <button
          type="button"
          onClick={() => {
            onOpenConnect();
            setMenuOpen(false);
          }}
          disabled={isConnecting}
          className="inline-flex items-center justify-center gap-2.5 rounded-[10px] bg-amplifi-nav px-5 py-3 text-sm font-medium text-white transition-opacity disabled:opacity-50"
        >
          <img
            src={LOGOS.wallet}
            alt=""
            className="h-5 w-5"
            aria-hidden
          />
          {isConnecting ? "Connecting…" : "Connect Wallet"}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            onOpenConnect();
            setMenuOpen(false);
          }}
          className="rounded-[10px] border border-amplifi-border bg-amplifi-surface px-5 py-3 text-sm font-medium text-amplifi-text transition-colors hover:opacity-90"
        >
          {short(displayAddress)}
        </button>
      )}
    </>
  );

  return (
    <header className="py-4 sm:py-6 lg:py-8">
      <div className="mx-auto flex items-center justify-between gap-4">
        {/* Left: brand + nav (desktop) */}
        <div className="flex items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-3">
            <img
              src={LOGOS.brand}
              alt="AmpliFi"
              aria-hidden
            />
          </div>
          <nav className="hidden items-center gap-2.5 lg:flex">
            {navLinks}
          </nav>
        </div>

        {/* Right: Connect (desktop) + Hamburger (mobile/tablet) */}
        <div className="flex items-center gap-2.5">
          <div className="hidden lg:block">
            {connectButton}
          </div>
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-amplifi-border bg-amplifi-surface text-amplifi-text transition-colors hover:opacity-90 lg:hidden"
            aria-label="Open menu"
            aria-expanded={menuOpen}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Overlay + slide panel from right (mobile/tablet) */}
      <div
        className={`fixed inset-0 z-50 lg:hidden ${menuOpen ? "pointer-events-auto" : "pointer-events-none"}`}
        aria-hidden={!menuOpen}
      >
        <div
          className={`absolute inset-0 bg-black/30 transition-opacity duration-200 ${menuOpen ? "opacity-100" : "opacity-0"}`}
          onClick={() => setMenuOpen(false)}
          aria-label="Close menu"
        />
        <div
          className={`absolute right-0 top-0 bottom-0 w-full max-w-[280px] bg-white shadow-xl transition-transform duration-250 ease-out flex flex-col ${menuOpen ? "translate-x-0" : "translate-x-full"}`}
        >
          <div className="flex items-center justify-between border-b border-amplifi-border p-4">
            <span className="text-sm font-semibold text-amplifi-text">Menu</span>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-amplifi-border text-amplifi-text hover:bg-amplifi-surface"
              aria-label="Close menu"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <nav className="flex flex-col gap-1 p-4">
            {TABS.map(({ id, label }) => {
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleTabSelect(id)}
                  className={
                    isActive
                      ? "flex items-center rounded-[10px] bg-amplifi-nav px-4 py-3 text-sm font-medium text-white"
                      : "flex items-center rounded-[10px] px-4 py-3 text-sm font-medium text-amplifi-text hover:bg-amplifi-surface"
                  }
                >
                  {label}
                </button>
              );
            })}
          </nav>
          <div className="mt-auto border-t border-amplifi-border p-4">
            {connectButton}
          </div>
        </div>
      </div>
    </header>
  );
}
