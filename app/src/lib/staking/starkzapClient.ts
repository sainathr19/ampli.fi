import {
  type Address,
  Amount,
  type ChainIdLiteral,
  type Pool,
  StarkZap,
  type Token,
  mainnetValidators,
  sepoliaValidators,
} from "starkzap";

export type SupportedNetwork = "mainnet" | "sepolia";

export type StakingValidator = {
  name: string;
  stakerAddress: string;
};

const DEFAULT_NETWORK: SupportedNetwork = "sepolia";

export const STARKNET_NETWORK: SupportedNetwork =
  (import.meta.env.VITE_STARKNET_NETWORK as SupportedNetwork) || DEFAULT_NETWORK;

const sdkConfig: ConstructorParameters<typeof StarkZap>[0] = {
  network: STARKNET_NETWORK,
};

const paymasterNodeUrl = import.meta.env.VITE_PAYMASTER_URL?.trim();
if (paymasterNodeUrl) {
  sdkConfig.paymaster = { nodeUrl: paymasterNodeUrl };
}

export const stakingSdk = new StarkZap(sdkConfig);

const validatorPresets =
  STARKNET_NETWORK === "mainnet" ? mainnetValidators : sepoliaValidators;

export const stakingValidators: StakingValidator[] = Object.values(
  validatorPresets
).map((validator) => ({
  name: validator.name,
  stakerAddress: validator.stakerAddress,
}));

export async function getStakeableTokens(): Promise<Token[]> {
  return stakingSdk.stakingTokens();
}

export async function getValidatorPools(stakerAddress: string): Promise<Pool[]> {
  return stakingSdk.getStakerPools(stakerAddress as Address);
}

export function parseStakeAmount(amount: string, token: Token): Amount {
  return Amount.parse(amount, token);
}

export function chainLiteralToNetwork(
  chainLiteral: ChainIdLiteral
): SupportedNetwork {
  return chainLiteral === "SN_MAIN" ? "mainnet" : "sepolia";
}
