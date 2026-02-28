import { create } from "zustand";
import { persist } from "zustand/middleware";
import { BitcoinNetwork } from "@atomiqlabs/sdk";
import {
  RpcProviderWithRetries,
  StarknetSigner,
} from "@atomiqlabs/chain-starknet";
import { connect, disconnect } from "@starknet-io/get-starknet";
import { WalletAccount } from "starknet";
import { XverseBitcoinWallet } from "@/lib/bitcoin/XverseBitcoinWallet";
import { UnisatBitcoinWallet } from "@/lib/bitcoin/UnisatBitcoinWallet";

const BITCOIN_NETWORK = BitcoinNetwork.TESTNET4;
const BITCOIN_RPC_URL = "https://mempool.space/testnet4/api";
const STARKNET_RPC_URL = "https://starknet-sepolia.public.blastapi.io/rpc/v0_8";

interface StarknetProvider {
  enable?: () => Promise<void>;
  accounts?: string[];
  selectedAddress?: string;
}

interface WindowWithProviders {
  starknet?: StarknetProvider;
  starknet_argentX?: StarknetProvider;
  starknet_braavos?: StarknetProvider;
  btc?: unknown;
  BitcoinProvider?: unknown;
}

type BitcoinWalletInstance =
  | XverseBitcoinWallet
  | UnisatBitcoinWallet
  | null;

export type StarknetSource = "extension" | "privy" | null;

type WalletState = {
  isXverseAvailable: boolean;
  isUniSatAvailable: boolean;
  isConnecting: boolean;
  connected: boolean;
  bitcoinPaymentAddress: string | null;
  starknetAddress: string | null;
  bitcoinWalletType: "xverse" | "unisat" | null;
  starknetWalletName: string | null;
  starknetSource: StarknetSource;
  /** Live instances for swap (not persisted). */
  bitcoinWalletInstance: BitcoinWalletInstance;
  starknetSigner: StarknetSigner | null;

  detectProviders: () => void;
  connectBitcoin: (walletType: "xverse" | "unisat") => Promise<void>;
  connectStarknet: () => Promise<void>;
  connectPrivyStarknet: (address: string, signer: StarknetSigner) => void;
  disconnectBitcoin: () => void;
  disconnectStarknet: () => Promise<void>;
  disconnectPrivyStarknet: () => void;
};

export const useWallet = create<WalletState>()(
  persist(
    (set, get) => ({
      isXverseAvailable: false,
      isUniSatAvailable: false,
      isConnecting: false,
      connected: false,
      bitcoinPaymentAddress: null,
      starknetAddress: null,
      bitcoinWalletType: null,
      starknetWalletName: null,
      starknetSource: null,
      bitcoinWalletInstance: null,
      starknetSigner: null,

      detectProviders: () => {
        if (typeof window === "undefined") return;
        const win = window as Window &
          WindowWithProviders & { unisat?: unknown };
        const hasXverse = Boolean(win.btc || win.BitcoinProvider);
        const hasUnisat = Boolean(win.unisat);
        set({ isXverseAvailable: hasXverse, isUniSatAvailable: hasUnisat });
      },

      connectBitcoin: async (walletType: "xverse" | "unisat") => {
        const current = get();
        if (current.isConnecting || current.bitcoinPaymentAddress) return;

        try {
          set({ isConnecting: true });

          const wallet =
            walletType === "xverse"
              ? await XverseBitcoinWallet.connect(
                  BITCOIN_NETWORK,
                  BITCOIN_RPC_URL
                )
              : await UnisatBitcoinWallet.connect(
                  BITCOIN_NETWORK,
                  BITCOIN_RPC_URL
                );

          const address = wallet.getReceiveAddress();
          set({
            bitcoinPaymentAddress: address,
            bitcoinWalletType: walletType,
            bitcoinWalletInstance: wallet,
            connected: true,
            isConnecting: false,
          });
        } catch (error) {
          console.error(`Failed to connect ${walletType}:`, error);
          set({ isConnecting: false });
          throw error;
        }
      },

      connectStarknet: async () => {
        const current = get();
        if (current.isConnecting || current.starknetAddress) return;

        try {
          set({ isConnecting: true });
          const swo = await connect({
            modalMode: "alwaysAsk",
            modalTheme: "dark",
          });

          if (!swo) {
            throw new Error("Failed to connect Starknet wallet");
          }

          const walletAccount = await WalletAccount.connect(
            new RpcProviderWithRetries({ nodeUrl: STARKNET_RPC_URL }),
            swo
          );

          let addr = walletAccount.address;
          for (let i = 0; i < 50; i++) {
            if (
              addr &&
              addr !==
                "0x0000000000000000000000000000000000000000000000000000000000000000"
            ) {
              break;
            }
            await new Promise((r) => setTimeout(r, 100));
            addr = walletAccount.address;
          }

          const signer = new StarknetSigner(walletAccount);
          set({
            starknetAddress: addr,
            starknetWalletName: swo.name,
            starknetSource: "extension",
            starknetSigner: signer,
            connected: true,
            isConnecting: false,
          });
        } catch (error) {
          console.error("Failed to connect Starknet:", error);
          set({ isConnecting: false });
          throw error;
        }
      },

      connectPrivyStarknet: (address, signer) => {
        set({
          starknetAddress: address,
          starknetWalletName: "Privy",
          starknetSource: "privy",
          starknetSigner: signer,
          connected: true,
        });
      },

      disconnectBitcoin: () => {
        set({
          bitcoinPaymentAddress: null,
          bitcoinWalletType: null,
          bitcoinWalletInstance: null,
          connected: Boolean(get().starknetAddress),
        });
      },

      disconnectStarknet: async () => {
        if (get().starknetSource === "privy") return;
        try {
          await disconnect({ clearLastWallet: true });
        } catch {
          // ignore
        }
        set({
          starknetAddress: null,
          starknetWalletName: null,
          starknetSource: null,
          starknetSigner: null,
          connected: Boolean(get().bitcoinPaymentAddress),
        });
      },

      disconnectPrivyStarknet: () => {
        if (get().starknetSource !== "privy") return;
        set({
          starknetAddress: null,
          starknetWalletName: null,
          starknetSource: null,
          starknetSigner: null,
          connected: Boolean(get().bitcoinPaymentAddress),
        });
      },
    }),
    {
      name: "amplifi-wallet",
      partialize: (state) => ({
        bitcoinPaymentAddress: state.bitcoinPaymentAddress,
        starknetAddress: state.starknetAddress,
        bitcoinWalletType: state.bitcoinWalletType,
        starknetWalletName: state.starknetWalletName,
        connected: state.connected,
      }),
    }
  )
);
