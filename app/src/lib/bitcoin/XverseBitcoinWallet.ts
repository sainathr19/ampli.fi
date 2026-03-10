import {
  Address,
  AddressPurpose,
  BitcoinNetworkType,
  GetAddressResponse,
  getAddress,
  signTransaction,
  request,
} from "sats-connect";
import { BitcoinWalletBase } from "./BitcoinWalletBase";
import { BitcoinNetwork, CoinselectAddressTypes } from "@atomiqlabs/sdk";
import { bytesToHex } from "@noble/hashes/utils";

/** Convert Uint8Array to base64 string (browser-safe, no Buffer needed). */
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++)
    binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** Convert base64 string to Uint8Array (browser-safe, no Buffer needed). */
function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
import { Address as AddressParser } from "@scure/btc-signer";
import { Transaction } from "@scure/btc-signer";
import { BTC_NETWORK } from "@scure/btc-signer/utils";

function identifyAddressType(
  address: string,
  network: BTC_NETWORK,
): CoinselectAddressTypes {
  const decoded = AddressParser(network).decode(address);
  switch (decoded.type) {
    case "pkh":
      return "p2pkh";
    case "wpkh":
      return "p2wpkh";
    case "tr":
      return "p2tr";
    case "sh":
      return "p2sh-p2wpkh";
    default:
      return "p2wpkh";
  }
}

export class XverseBitcoinWallet extends BitcoinWalletBase {
  readonly account: Address;
  readonly addressType: CoinselectAddressTypes;
  readonly bitcoinNetwork: BitcoinNetwork;

  private constructor(
    account: Address,
    bitcoinNetwork: BitcoinNetwork,
    rpcUrl: string,
  ) {
    super("Xverse", "/icons/xverse.svg", bitcoinNetwork, rpcUrl);
    this.account = account;
    this.bitcoinNetwork = bitcoinNetwork;
    this.addressType = identifyAddressType(account.address, this.network);
    (
      this as unknown as {
        getAccounts: () => ReturnType<
          XverseBitcoinWallet["toBitcoinWalletAccounts"]
        >;
      }
    ).getAccounts = () => this.toBitcoinWalletAccounts();
  }

  /** Map our BitcoinNetwork enum to the sats-connect BitcoinNetworkType name. */
  private static toNetworkType(net: BitcoinNetwork): BitcoinNetworkType {
    if (net === BitcoinNetwork.MAINNET) return BitcoinNetworkType.Mainnet;
    return BitcoinNetworkType.Testnet4;
  }

  /**
   * Check the wallet's current network. Returns true if it already matches.
   * Returns false if it doesn't match or if the check isn't supported.
   */
  private static async isOnCorrectNetwork(
    expected: BitcoinNetworkType,
  ): Promise<boolean> {
    try {
      const res = await request("wallet_getNetwork", null);
      if (res.status === "success") {
        return res.result.bitcoin.name === expected;
      }
    } catch {
      // Not supported — assume correct and let getAddress handle it
    }
    return true;
  }

  /**
   * Prompt the wallet to switch to the expected network.
   * Silently continues if the switch fails (getAddress will enforce it anyway).
   */
  private static async switchNetwork(
    expected: BitcoinNetworkType,
  ): Promise<void> {
    try {
      await request("wallet_changeNetwork", { name: expected });
    } catch {
      // Silently continue — the next getAddress call will request the right network
    }
  }

  /** Request addresses from the wallet. Returns the response or null if cancelled. */
  private static async requestAddress(
    networkType: BitcoinNetworkType,
  ): Promise<GetAddressResponse | null> {
    let result: GetAddressResponse | null = null;
    let cancelled = false;

    await getAddress({
      payload: {
        purposes: [AddressPurpose.Payment],
        message: "Connect your Bitcoin wallet to AmpliFi",
        network: { type: networkType },
      },
      onFinish: (_result: GetAddressResponse) => {
        result = _result;
      },
      onCancel: () => {
        cancelled = true;
      },
    });

    if (cancelled) return null;
    return result;
  }

  static async connect(
    bitcoinNetwork: BitcoinNetwork,
    rpcUrl: string,
  ): Promise<XverseBitcoinWallet> {
    const networkType = XverseBitcoinWallet.toNetworkType(bitcoinNetwork);

    // 1. Connect first — get the address (user approves in wallet)
    let result = await XverseBitcoinWallet.requestAddress(networkType);

    // 2. If connected, check if the wallet is on the right network
    if (result) {
      const correctNetwork = await XverseBitcoinWallet.isOnCorrectNetwork(networkType);
      if (!correctNetwork) {
        // 3. Prompt the user to switch network in the wallet
        await XverseBitcoinWallet.switchNetwork(networkType);
        // 4. Re-connect to get the address on the correct network
        result = await XverseBitcoinWallet.requestAddress(networkType);
      }
    }

    if (!result) {
      throw new Error("User cancelled connection request");
    }

    const addresses =
      (
        result as unknown as {
          addresses?: Array<{
            purpose: AddressPurpose;
            address: string;
            publicKey?: string;
          }>;
        }
      ).addresses || [];
    const paymentAccount = addresses.find(
      (a) => a.purpose === AddressPurpose.Payment,
    );
    if (!paymentAccount) {
      throw new Error("No payment address found");
    }

    let pk =
      typeof paymentAccount.publicKey === "string"
        ? paymentAccount.publicKey.trim()
        : "";
    const isHex = pk !== "" && /^[0-9a-fA-F]+$/.test(pk);
    const looksCompressed =
      isHex && pk.length === 66 && (pk.startsWith("02") || pk.startsWith("03"));
    if (!looksCompressed) {
      pk = "02" + "0".repeat(64);
      (paymentAccount as unknown as { publicKey: string }).publicKey = pk;
    }

    const fullAccount: Address = {
      address: paymentAccount.address,
      publicKey: paymentAccount.publicKey as string,
      purpose: AddressPurpose.Payment,
      addressType: "p2wpkh" as unknown as Address["addressType"],
      walletType: "software",
    };

    return new XverseBitcoinWallet(fullAccount, bitcoinNetwork, rpcUrl);
  }

  getReceiveAddress(): string {
    return this.account.address;
  }

  getBalance(): Promise<{
    confirmedBalance: bigint;
    unconfirmedBalance: bigint;
  }> {
    return super._getBalance(this.account.address);
  }

  getFundedPsbtFee(
    _inputPsbt: Transaction,
    _feeRate?: number,
  ): Promise<number> {
    return Promise.resolve(0);
  }

  getSpendableBalance(
    psbt?: Transaction,
    feeRate?: number,
  ): Promise<{ balance: bigint; feeRate: number; totalFee: number }> {
    return super._getSpendableBalance(
      this.toBitcoinWalletAccounts(),
      psbt,
      feeRate,
    );
  }

  protected toBitcoinWalletAccounts(): {
    pubkey: string;
    address: string;
    addressType: CoinselectAddressTypes;
  }[] {
    return [
      {
        pubkey: this.account.publicKey as string,
        address: this.account.address,
        addressType: this.addressType,
      },
    ];
  }

  async sendTransaction(
    address: string,
    amount: bigint,
    feeRate?: number,
  ): Promise<string> {
    const { psbt } = await super._getPsbt(
      this.toBitcoinWalletAccounts(),
      address,
      Number(amount),
      feeRate,
    );

    if (!psbt) {
      throw new Error("Not enough balance!");
    }

    const networkType = XverseBitcoinWallet.toNetworkType(this.bitcoinNetwork);

    let txId: string | null = null;
    let psbtBase64: string | null = null;
    let cancelled = false;

    await signTransaction({
      payload: {
        network: { type: networkType },
        message: "Sign transaction",
        psbtBase64: uint8ToBase64(psbt.toPSBT(0)),
        broadcast: true,
        inputsToSign: [
          {
            address: this.account.address,
            signingIndexes: Array.from(
              { length: psbt.inputsLength },
              (_, i) => i,
            ),
          },
        ],
      },
      onFinish: (resp: { txId?: string; psbtBase64?: string }) => {
        txId = resp.txId ?? null;
        psbtBase64 = resp.psbtBase64 ?? null;
      },
      onCancel: () => {
        cancelled = true;
      },
    });

    if (cancelled) {
      throw new Error("User cancelled transaction");
    }

    if (!txId) {
      if (!psbtBase64) {
        throw new Error("Transaction not properly signed!");
      }
      const signedPsbt = Transaction.fromPSBT(base64ToUint8(psbtBase64));
      signedPsbt.finalize();
      const txHex = bytesToHex(signedPsbt.extract());
      txId = await super._sendTransaction(txHex);
    }

    return txId;
  }

  async signPsbt(
    psbt: Transaction,
    signInputs: number[],
  ): Promise<Transaction> {
    const networkType = XverseBitcoinWallet.toNetworkType(this.bitcoinNetwork);

    let psbtBase64: string | null = null;
    let cancelled = false;

    await signTransaction({
      payload: {
        network: { type: networkType },
        message: "Sign transaction",
        psbtBase64: uint8ToBase64(psbt.toPSBT(0)),
        inputsToSign: [
          {
            address: this.account.address,
            signingIndexes: signInputs,
          },
        ],
      },
      onFinish: (resp: { psbtBase64?: string }) => {
        psbtBase64 = resp.psbtBase64 ?? null;
      },
      onCancel: () => {
        cancelled = true;
      },
    });

    if (cancelled) {
      throw new Error("User cancelled signing");
    }

    if (!psbtBase64) {
      throw new Error("PSBT not properly signed!");
    }

    return Transaction.fromPSBT(base64ToUint8(psbtBase64));
  }
}
