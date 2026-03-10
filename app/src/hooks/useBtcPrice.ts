import { useState, useEffect } from "react";

const REFRESH_MS = 60_000; // refresh every 60s

export function useBtcPrice() {
  const [btcPrice, setBtcPrice] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchPrice() {
      try {
        const res = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,starknet&vs_currencies=usd"
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.bitcoin?.usd) {
          setBtcPrice(data.bitcoin.usd);
        }
      } catch {
        // silently fail — USD display is optional
      }
    }

    fetchPrice();
    const id = setInterval(fetchPrice, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return btcPrice;
}
