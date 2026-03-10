import {
  type Address,
  BaseWallet,
  type Call,
  ChainId,
  type DeployOptions,
  type EnsureReadyOptions,
  type ExecuteOptions,
  type FeeMode,
  type PreflightOptions,
  type PreflightResult,
  type RpcProvider,
  Tx,
  getStakingPreset,
} from "starkzap";

type AccountLike = {
  address: string;
  getChainId?: () => Promise<string>;
  execute: (calls: Call[]) => Promise<{ transaction_hash: string }>;
  signMessage: (typedData: unknown) => Promise<unknown>;
  estimateInvokeFee?: (tx: Call[]) => Promise<unknown>;
  estimateFee?: (tx: Call[]) => Promise<unknown>;
  provider?: RpcProvider;
  providerOrAccount?: RpcProvider;
  getClassHashAt?: (address: Address) => Promise<string>;
};

function isProviderLike(value: unknown): value is RpcProvider {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.callContract === "function" &&
    typeof candidate.getClassHashAt === "function" &&
    typeof candidate.waitForTransaction === "function"
  );
}

function resolveProvider(account: AccountLike): RpcProvider | null {
  const candidates: unknown[] = [
    account.provider,
    account.providerOrAccount,
    account,
  ];

  for (const candidate of candidates) {
    if (isProviderLike(candidate)) {
      return candidate;
    }
  }

  return null;
}

function stringifyUnknownError(value: unknown): string | null {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function extractExecuteErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const anyError = error as Error & {
      shortMessage?: string;
      details?: string;
      cause?: unknown;
      data?: { message?: string; error_message?: string };
    };
    const direct =
      anyError.shortMessage ||
      anyError.message ||
      anyError.details ||
      anyError.data?.message ||
      anyError.data?.error_message;
    if (direct && !direct.includes("UNKNOWN_ERROR")) {
      return direct;
    }
    if (anyError.cause) {
      const nested = extractExecuteErrorMessage(anyError.cause);
      if (nested) return nested;
    }
    const serialized = stringifyUnknownError(error);
    if (serialized && serialized !== "{}") {
      return serialized;
    }
    return anyError.message || "Transaction execution failed";
  }

  if (typeof error === "object" && error !== null) {
    const candidate = error as {
      shortMessage?: string;
      message?: string;
      details?: string;
      reason?: string;
      error?: unknown;
      data?: { message?: string; error_message?: string };
    };
    const direct =
      candidate.shortMessage ||
      candidate.message ||
      candidate.details ||
      candidate.reason ||
      candidate.data?.message ||
      candidate.data?.error_message;
    if (direct && !direct.includes("UNKNOWN_ERROR")) {
      return direct;
    }
    if (candidate.error) {
      const nested = extractExecuteErrorMessage(candidate.error);
      if (nested) return nested;
    }
    const serialized = stringifyUnknownError(error);
    if (serialized && serialized !== "{}") {
      return serialized;
    }
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return "Transaction execution failed";
}

export class InjectedStarkzapWallet extends BaseWallet {
  private readonly account: AccountLike;
  private readonly provider: RpcProvider;
  private readonly chainId: ChainId;
  private readonly feeMode: FeeMode;
  private readonly classHash: string;

  constructor(
    account: AccountLike,
    provider: RpcProvider,
    chainId: ChainId,
    classHash: string,
    feeMode: FeeMode = "user_pays"
  ) {
    super(account.address as unknown as Address, getStakingPreset(chainId));
    this.account = account;
    this.provider = provider;
    this.chainId = chainId;
    this.classHash = classHash;
    this.feeMode = feeMode;
  }

  static async fromAccount(
    account: AccountLike
  ): Promise<InjectedStarkzapWallet> {
    const provider = resolveProvider(account);
    if (!provider) {
      throw new Error("Wallet provider is unavailable");
    }
    const chainId = ChainId.SEPOLIA;
    const classHash = await provider
      .getClassHashAt(account.address as unknown as Address)
      .catch(() => "");
    return new InjectedStarkzapWallet(account, provider, chainId, classHash);
  }

  async isDeployed(): Promise<boolean> {
    return Boolean(this.classHash);
  }

  async ensureReady(options?: EnsureReadyOptions): Promise<void> {
    void options;
    return;
  }

  async deploy(options?: DeployOptions): Promise<Tx> {
    void options;
    throw new Error("Deploy is not supported for injected wallets in this flow");
  }

  async execute(calls: Call[], options?: ExecuteOptions): Promise<Tx> {
    if (options?.feeMode === "sponsored") {
      throw new Error(
        "Sponsored mode is not available with injected wallets yet"
      );
    }

    try {
      const result = await this.account.execute(calls);
      return new Tx(result.transaction_hash, this.provider, this.chainId);
    } catch (error) {
      throw new Error(extractExecuteErrorMessage(error));
    }
  }

  async signMessage(typedData: unknown): Promise<unknown> {
    return this.account.signMessage(typedData);
  }

  async preflight(options: PreflightOptions): Promise<PreflightResult> {
    try {
      await this.estimateFee(options.calls);
      return { ok: true };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Preflight failed";
      return { ok: false, reason };
    }
  }

  getAccount(): never {
    return this.account as never;
  }

  getProvider(): RpcProvider {
    return this.provider;
  }

  getChainId(): ChainId {
    return this.chainId;
  }

  getFeeMode(): FeeMode {
    return this.feeMode;
  }

  getClassHash(): string {
    return this.classHash;
  }

  async estimateFee(calls: Call[]): Promise<never> {
    if (this.account.estimateInvokeFee) {
      return this.account.estimateInvokeFee(calls) as never;
    }
    if (this.account.estimateFee) {
      return this.account.estimateFee(calls) as never;
    }

    throw new Error("Unable to estimate fee for this wallet");
  }

  async disconnect(): Promise<void> {
    return;
  }
}
