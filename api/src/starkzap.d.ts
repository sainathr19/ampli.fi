/**
 * Type declarations for starkzap.
 * Starkzap's published types have resolution issues with tsc;
 * these declarations ensure our imports type-check correctly.
 * Runtime: starkzap works with bun/tsx.
 */
declare module "starkzap" {
  import type { RpcProvider } from "starknet";

  export type Address = string & { readonly __type?: "StarknetAddress" };
  export function fromAddress(value: string | bigint): Address;

  export interface Token {
    name: string;
    address: Address;
    decimals: number;
    symbol: string;
    metadata?: { logoUrl?: URL };
  }

  export interface Validator {
    name: string;
    stakerAddress: Address;
    logoUrl?: URL | null;
  }

  export interface Pool {
    poolContract: Address;
    token: Token;
    amount: { toUnit: () => string; toFormatted: () => string };
  }

  export interface PoolMember {
    staked: { toUnit: () => string };
    rewards: { toUnit: () => string };
    total: { toUnit: () => string };
    unpooling: { toUnit: () => string };
    unpoolTime: Date | null;
    commissionPercent: number;
    rewardAddress: Address;
  }

  export interface WalletInterface {
    address: Address;
  }

  export class Staking {
    static fromPool(
      poolAddress: Address,
      provider: RpcProvider,
      config: { contract: Address },
      options?: { timeoutMs?: number; signal?: AbortSignal }
    ): Promise<Staking>;
    getPosition(wallet: WalletInterface): Promise<PoolMember | null>;
    getCommission(): Promise<number>;
  }

  export class StarkZap {
    constructor(config: { network?: string; rpcUrl?: string; paymaster?: { nodeUrl: string } });
    getProvider(): RpcProvider;
    getStakerPools(staker: Address): Promise<Pool[]>;
    stakingTokens(): Promise<Token[]>;
  }

  export const mainnetValidators: Record<string, Validator>;
  export const sepoliaValidators: Record<string, Validator>;
}
