import {
  Address,
  AddressPurpose,
  BitcoinNetworkType,
  GetAddressResponse,
  getAddress,
  signTransaction,
} from "sats-connect";
import { BitcoinWalletBase } from "./BitcoinWalletBase";
import { BitcoinNetwork, CoinselectAddressTypes } from "@atomiqlabs/sdk";
import { Address as AddressParser } from "@scure/btc-signer";
import { Transaction } from "@scure/btc-signer";
import { BTC_NETWORK } from "@scure/btc-signer/utils";

function identifyAddressType(
  address: string,
  network: BTC_NETWORK
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
    rpcUrl: string
  ) {
    super("Xverse", "/icons/xverse.svg", bitcoinNetwork, rpcUrl);
    this.account = account;
    this.bitcoinNetwork = bitcoinNetwork;
    this.addressType = identifyAddressType(account.address, this.network);
    (this as unknown as { getAccounts: () => ReturnType<XverseBitcoinWallet["toBitcoinWalletAccounts"]> }).getAccounts =
      () => this.toBitcoinWalletAccounts();
  }

  static async connect(
    bitcoinNetwork: BitcoinNetwork,
    rpcUrl: string
  ): Promise<XverseBitcoinWallet> {
    const networkType =
      bitcoinNetwork === BitcoinNetwork.MAINNET
        ? BitcoinNetworkType.Mainnet
        : ("Testnet4" as unknown as BitcoinNetworkType);

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

    if (cancelled) {
      throw new Error("User cancelled connection request");
    }

    if (!result) {
      throw new Error("Failed to connect to Xverse wallet");
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
      (a) => a.purpose === AddressPurpose.Payment
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
      isHex &&
      pk.length === 66 &&
      (pk.startsWith("02") || pk.startsWith("03"));
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
    _feeRate?: number
  ): Promise<number> {
    return Promise.resolve(0);
  }

  getSpendableBalance(
    psbt?: Transaction,
    feeRate?: number
  ): Promise<{ balance: bigint; feeRate: number; totalFee: number }> {
    return super._getSpendableBalance(
      this.toBitcoinWalletAccounts(),
      psbt,
      feeRate
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
    feeRate?: number
  ): Promise<string> {
    const { psbt } = await super._getPsbt(
      this.toBitcoinWalletAccounts(),
      address,
      Number(amount),
      feeRate
    );

    if (!psbt) {
      throw new Error("Not enough balance!");
    }

    const networkType =
      this.bitcoinNetwork === BitcoinNetwork.MAINNET
        ? BitcoinNetworkType.Mainnet
        : ("Testnet4" as unknown as BitcoinNetworkType);

    let txId: string | null = null;
    let psbtBase64: string | null = null;
    let cancelled = false;

    await signTransaction({
      payload: {
        network: { type: networkType },
        message: "Sign transaction",
        psbtBase64: Buffer.from(psbt.toPSBT(0)).toString("base64"),
        broadcast: true,
        inputsToSign: [
          {
            address: this.account.address,
            signingIndexes: Array.from(
              { length: psbt.inputsLength },
              (_, i) => i
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
      const signedPsbt = Transaction.fromPSBT(
        Buffer.from(psbtBase64, "base64")
      );
      signedPsbt.finalize();
      const txHex = Buffer.from(signedPsbt.extract()).toString("hex");
      txId = await super._sendTransaction(txHex);
    }

    return txId;
  }

  async signPsbt(
    psbt: Transaction,
    signInputs: number[]
  ): Promise<Transaction> {
    const networkType =
      this.bitcoinNetwork === BitcoinNetwork.MAINNET
        ? BitcoinNetworkType.Mainnet
        : ("Testnet4" as unknown as BitcoinNetworkType);

    let psbtBase64: string | null = null;
    let cancelled = false;

    await signTransaction({
      payload: {
        network: { type: networkType },
        message: "Sign transaction",
        psbtBase64: Buffer.from(psbt.toPSBT(0)).toString("base64"),
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

    return Transaction.fromPSBT(Buffer.from(psbtBase64, "base64"));
  }
}
