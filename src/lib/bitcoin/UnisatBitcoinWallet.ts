import { BitcoinWalletBase } from "./BitcoinWalletBase";
import { BitcoinNetwork, CoinselectAddressTypes } from "@atomiqlabs/sdk";
import { Address as AddressParser } from "@scure/btc-signer";
import { Transaction } from "@scure/btc-signer";
import { BTC_NETWORK } from "@scure/btc-signer/utils";

interface UnisatProvider {
  requestAccounts(): Promise<string[]>;
  getAccounts(): Promise<string[]>;
  getPublicKey(): Promise<string>;
  getBalance(): Promise<{
    confirmed: number;
    unconfirmed: number;
    total: number;
  }>;
  signPsbt(psbtHex: string, options?: unknown): Promise<string>;
  pushPsbt(psbtHex: string): Promise<string>;
  getNetwork(): Promise<string>;
}

declare global {
  interface Window {
    unisat?: UnisatProvider;
  }
}

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

export class UnisatBitcoinWallet extends BitcoinWalletBase {
  readonly address: string;
  readonly pubkey: string;
  readonly addressType: CoinselectAddressTypes;
  readonly bitcoinNetwork: BitcoinNetwork;
  private provider: UnisatProvider;

  private constructor(
    address: string,
    pubkey: string,
    provider: UnisatProvider,
    bitcoinNetwork: BitcoinNetwork,
    rpcUrl: string
  ) {
    super("UniSat", "/icons/unisat.svg", bitcoinNetwork, rpcUrl);
    this.address = address;
    this.pubkey = pubkey;
    this.provider = provider;
    this.bitcoinNetwork = bitcoinNetwork;
    this.addressType = identifyAddressType(address, this.network);
    (this as unknown as { getAccounts: () => ReturnType<UnisatBitcoinWallet["toBitcoinWalletAccounts"]> }).getAccounts =
      () => this.toBitcoinWalletAccounts();
  }

  static async connect(
    bitcoinNetwork: BitcoinNetwork,
    rpcUrl: string
  ): Promise<UnisatBitcoinWallet> {
    if (typeof window === "undefined" || !window.unisat) {
      throw new Error("UniSat wallet not found");
    }

    const provider = window.unisat;

    const accounts = await provider.requestAccounts();
    if (!accounts || accounts.length === 0) {
      throw new Error("No accounts found");
    }

    const address = accounts[0];
    const pubkey = await provider.getPublicKey();

    return new UnisatBitcoinWallet(
      address,
      pubkey,
      provider,
      bitcoinNetwork,
      rpcUrl
    );
  }

  getReceiveAddress(): string {
    return this.address;
  }

  async getBalance(): Promise<{
    confirmedBalance: bigint;
    unconfirmedBalance: bigint;
  }> {
    try {
      const balance = await this.provider.getBalance();
      return {
        confirmedBalance: BigInt(balance.confirmed),
        unconfirmedBalance: BigInt(balance.unconfirmed),
      };
    } catch {
      return super._getBalance(this.address);
    }
  }

  protected toBitcoinWalletAccounts(): {
    pubkey: string;
    address: string;
    addressType: CoinselectAddressTypes;
  }[] {
    return [
      {
        pubkey: this.pubkey,
        address: this.address,
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

    const psbtHex = Buffer.from(psbt.toPSBT(0)).toString("hex");
    const signedPsbtHex = await this.provider.signPsbt(psbtHex, {
      autoFinalized: true,
    });
    return this.provider.pushPsbt(signedPsbtHex);
  }

  async signPsbt(
    psbt: Transaction,
    _signInputs: number[]
  ): Promise<Transaction> {
    const psbtHex = Buffer.from(psbt.toPSBT(0)).toString("hex");
    const signedPsbtHex = await this.provider.signPsbt(psbtHex, {
      autoFinalized: false,
    });
    return Transaction.fromPSBT(Buffer.from(signedPsbtHex, "hex"));
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
}
