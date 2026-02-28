import {
  StarkZap,
  Staking,
  fromAddress,
  mainnetValidators,
  sepoliaValidators,
  type Address,
  type Pool,
  type PoolMember,
  type Validator,
  type WalletInterface,
} from "starkzap";
import type { EarnProtocolAdapter } from "./protocols.js";
import type { EarnHistoryEntry, EarnPool, EarnPosition, EarnToken } from "../../types/earn.js";
import { settings } from "../settings.js";
import { fetchNativeStakingHistory } from "./eventFetcher.js";

const PROTOCOL = "native_staking";
const MAINNET_STAKING_CONTRACT =
  "0x00ca1702e64c81d9a07b86bd2c540188d92a2c73cf5cc0e508d949015e7e84a7";
const SEPOLIA_STAKING_CONTRACT =
  "0x03745ab04a431fc02871a139be6b93d9260b0ff3e779ad9c8b377183b23109f1";

function normalizeHex(value: string): string {
  const sanitized = value.toLowerCase();
  return sanitized.startsWith("0x") ? sanitized : `0x${sanitized}`;
}

type LightweightWallet = {
  address: Address;
};

function getSdk(): StarkZap {
  const network = settings.network === "mainnet" ? "mainnet" : "sepolia";
  return new StarkZap({
    network,
    rpcUrl: settings.rpc_url,
  });
}

function getStakingConfig(): { contract: Address } {
  const contract =
    settings.network === "mainnet" ? MAINNET_STAKING_CONTRACT : SEPOLIA_STAKING_CONTRACT;
  return { contract: fromAddress(contract) };
}

function getValidators(): Validator[] {
  if (settings.network === "mainnet") {
    return Object.values(mainnetValidators);
  }
  return Object.values(sepoliaValidators);
}

function toToken(token: Pool["token"]): EarnToken {
  return {
    symbol: token.symbol,
    address: token.address,
    decimals: token.decimals ?? null,
  };
}

async function toEarnPool(
  sdk: StarkZap,
  validator: Validator,
  pool: Pool
): Promise<EarnPool> {
  const staking = await Staking.fromPool(pool.poolContract, sdk.getProvider(), getStakingConfig());
  const commissionPercent = await staking.getCommission().catch(() => null);

  return {
    id: `${validator.stakerAddress}:${pool.poolContract}`,
    poolContract: pool.poolContract,
    validator: {
      name: validator.name,
      stakerAddress: validator.stakerAddress,
    },
    token: toToken(pool.token),
    delegatedAmount: pool.amount.toUnit(),
    commissionPercent,
  };
}

async function getPools(validatorFilter?: string): Promise<EarnPool[]> {
  const sdk = getSdk();
  const validators = getValidators();
  const filteredValidators = validatorFilter
    ? validators.filter((entry) => entry.stakerAddress.toLowerCase() === validatorFilter.toLowerCase())
    : validators;

  const allPools = await Promise.all(
    filteredValidators.map(async (validator) => {
      const pools = await sdk.getStakerPools(validator.stakerAddress);
      return Promise.all(pools.map((pool: Pool) => toEarnPool(sdk, validator, pool)));
    })
  );

  return allPools.flat();
}

async function getPosition(
  sdk: StarkZap,
  poolAddress: string,
  userAddress: string,
  token: EarnToken
): Promise<EarnPosition | null> {
  const staking = await Staking.fromPool(fromAddress(poolAddress), sdk.getProvider(), getStakingConfig());

  const wallet = { address: fromAddress(userAddress) } as LightweightWallet;
  const position = (await staking.getPosition(wallet as unknown as WalletInterface)) as PoolMember | null;
  if (!position) return null;

  return {
    poolContract: poolAddress,
    token,
    staked: position.staked.toUnit(),
    rewards: position.rewards.toUnit(),
    total: position.total.toUnit(),
    unpooling: position.unpooling.toUnit(),
    unpoolTime: position.unpoolTime ? position.unpoolTime.toISOString() : null,
    commissionPercent: position.commissionPercent,
    rewardAddress: position.rewardAddress,
    walletAddress: userAddress,
  };
}

async function getPositions(userAddress: string): Promise<EarnPosition[]> {
  const sdk = getSdk();
  const pools = await getPools();
  const results = await Promise.all(
    pools.map(async (pool) => getPosition(sdk, pool.poolContract, userAddress, pool.token))
  );

  return results.filter((entry): entry is EarnPosition => !!entry);
}

async function getHistory(userAddress: string, opts?: { type?: string }): Promise<EarnHistoryEntry[]> {
  const sdk = getSdk();
  const pools = await getPools();
  const poolAddresses = Array.from(new Set(pools.map((pool) => pool.poolContract)));
  const tokenByPool = new Map<string, EarnToken>(
    pools.map((pool) => [normalizeHex(pool.poolContract), pool.token])
  );

  const history = await fetchNativeStakingHistory({
    rpcUrl: settings.rpc_url,
    poolAddresses,
    userAddress,
    tokenByPoolAddress: tokenByPool,
  });

  if (!opts?.type) {
    return history;
  }

  return history.filter((entry) => entry.type === opts.type);
}

export function createNativeStakingAdapter(): EarnProtocolAdapter {
  return {
    protocol: PROTOCOL,
    getPools,
    getPositions,
    getHistory,
  };
}
