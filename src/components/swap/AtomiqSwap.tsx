import {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  BitcoinNetwork,
  SwapperFactory,
} from "@atomiqlabs/sdk";
import {
  RpcProviderWithRetries,
  StarknetInitializer,
  StarknetInitializerType,
} from "@atomiqlabs/chain-starknet";
import { useWallet } from "@/store/useWallet";

const STARKNET_RPC = "https://starknet-sepolia.public.blastapi.io/rpc/v0_8";
const factory = new SwapperFactory<[StarknetInitializerType]>([
  StarknetInitializer,
]);
const Tokens = factory.Tokens;

function getStarknetToken(
  dst: "ETH" | "STRK" | "WBTC"
) {
  if (dst === "ETH") return Tokens.STARKNET.ETH;
  if (dst === "WBTC") return Tokens.STARKNET._TESTNET_WBTC_VESU;
  return Tokens.STARKNET.STRK;
}

export function AtomiqSwap() {
  const {
    connected,
    bitcoinPaymentAddress,
    starknetAddress,
    bitcoinWalletInstance,
    starknetSigner,
  } = useWallet();

  const [amountBtc, setAmountBtc] = useState("");
  const [dstToken, setDstToken] = useState<"ETH" | "STRK" | "WBTC">("ETH");
  const [init, setInit] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [swapId, setSwapId] = useState<string | null>(null);

  const swapper = useMemo(() => {
    return factory.newSwapper({
      chains: { STARKNET: { rpcUrl: new RpcProviderWithRetries({ nodeUrl: STARKNET_RPC }) } },
      bitcoinNetwork: BitcoinNetwork.TESTNET4,
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await swapper.init();
        if (!cancelled) setInit(true);
      } catch (e) {
        if (!cancelled)
          setStatus("Failed to init: " + (e instanceof Error ? e.message : String(e)));
      }
    })();
    return () => {
      cancelled = true;
      void swapper.stop();
    };
  }, [swapper]);

  const runSwap = async () => {
    if (
      !connected ||
      !bitcoinPaymentAddress ||
      !starknetAddress ||
      !bitcoinWalletInstance ||
      !starknetSigner
    ) {
      setStatus("Connect both wallets first.");
      return;
    }
    if (!amountBtc || Number(amountBtc) <= 0) {
      setStatus("Enter amount.");
      return;
    }

    setSwapping(true);
    setStatus("Creating quote…");

    try {
      const amountSats = BigInt(Math.floor(Number(amountBtc) * 1e8));
      const token = getStarknetToken(dstToken);

      const swap = await swapper.swap(
        Tokens.BITCOIN.BTC,
        token,
        amountSats,
        true,
        bitcoinPaymentAddress,
        starknetAddress,
        {}
      );

      const id = swap.getId();
      setSwapId(id);
      setStatus("Quote created. Sending BTC…");

      swap.events.on("swapState", () => {
        setStatus("Swap state updated.");
      });

      const btcInstance = bitcoinWalletInstance as unknown as {
        publicKey?: string;
        pubkey?: string;
        getAccounts?: () => unknown;
        toBitcoinWalletAccounts?: () => unknown;
      };
      if (!btcInstance.publicKey && btcInstance.pubkey) {
        btcInstance.publicKey = btcInstance.pubkey;
      }
      if (!btcInstance.getAccounts && btcInstance.toBitcoinWalletAccounts) {
        btcInstance.getAccounts = () => btcInstance.toBitcoinWalletAccounts!();
      }

      await swap.sendBitcoinTransaction(bitcoinWalletInstance);
      setStatus("BTC sent. Waiting for confirmation…");

      await swap.waitForBitcoinTransaction(undefined, 1);

      setStatus("Claiming on Starknet…");
      try {
        await swap.waitTillClaimedOrFronted(AbortSignal.timeout(30_000));
        setStatus("Done. Claimed by watchtower.");
      } catch {
        await swap.claim(starknetSigner);
        setStatus("Done. Claimed manually.");
      }
    } catch (e) {
      setStatus("Error: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSwapping(false);
    }
  };

  const canSwap =
    init &&
    connected &&
    !!bitcoinWalletInstance &&
    !!starknetSigner &&
    !!amountBtc &&
    Number(amountBtc) > 0 &&
    !swapping;

  return (
    <div
      className="rounded-xl border p-5"
      style={{
        backgroundColor: "var(--amplifi-surface)",
        borderColor: "var(--amplifi-border)",
        borderRadius: "var(--amplifi-radius)",
        boxShadow: "var(--amplifi-shadow)",
      }}
    >
      <h2 className="mb-4 text-base font-semibold" style={{ color: "var(--amplifi-text)" }}>
        Swap BTC → Starknet
      </h2>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-sm" style={{ color: "var(--amplifi-text-muted)" }}>
            Amount (BTC)
          </label>
          <input
            type="number"
            min="0"
            step="0.00000001"
            value={amountBtc}
            onChange={(e) => setAmountBtc(e.target.value)}
            placeholder="0.0001"
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--amplifi-border)" }}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm" style={{ color: "var(--amplifi-text-muted)" }}>
            Receive on Starknet
          </label>
          <select
            value={dstToken}
            onChange={(e) => setDstToken(e.target.value as "ETH" | "STRK" | "WBTC")}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--amplifi-border)" }}
          >
            <option value="ETH">ETH</option>
            <option value="STRK">STRK</option>
            <option value="WBTC">WBTC</option>
          </select>
        </div>
        <div className="flex items-center justify-between gap-2 pt-2">
          <span className="text-xs" style={{ color: "var(--amplifi-text-muted)" }}>
            {connected ? "Wallets connected" : "Connect wallets to swap"}
          </span>
          <button
            type="button"
            onClick={runSwap}
            disabled={!canSwap}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
            style={{ backgroundColor: "var(--amplifi-primary)" }}
          >
            {swapping ? "Swapping…" : "Swap"}
          </button>
        </div>
        {status && (
          <p className="mt-2 text-xs" style={{ color: "var(--amplifi-text-muted)" }} role="status">
            {status}
          </p>
        )}
        {swapId && (
          <div
            className="mt-2 rounded-lg border p-2 text-xs"
            style={{ borderColor: "var(--amplifi-border)" }}
          >
            <span style={{ color: "var(--amplifi-text-muted)" }}>Swap ID: </span>
            <span className="font-mono break-all" style={{ color: "var(--amplifi-text)" }}>{swapId}</span>
          </div>
        )}
      </div>
    </div>
  );
}
