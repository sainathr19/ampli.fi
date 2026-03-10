import { useState, useCallback } from "react";
import { Contract, RpcProvider } from "starknet";
import { useWallet } from "@/store/useWallet";
import { RPC_URL } from "@/lib/constants";
import vTokenABI from "@/lib/vesu/abi.json";

export interface UseVesuDepositResult {
  deposit: (amount: string, vTokenAddress: string) => Promise<string>;
  isDepositing: boolean;
  error: string | null;
}

export function useVesuDeposit(): UseVesuDepositResult {
  const { starknetAccount } = useWallet();
  const [isDepositing, setIsDepositing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deposit = useCallback(
    async (amount: string, vTokenAddress: string): Promise<string> => {
      if (!starknetAccount) {
        throw new Error("Starknet account not connected");
      }
      if (!vTokenAddress) {
        throw new Error("V-Token address not provided");
      }

      setIsDepositing(true);
      setError(null);

      try {
        const provider = new RpcProvider({ nodeUrl: RPC_URL });
        const contract = new Contract(vTokenABI, vTokenAddress, starknetAccount);

        const assetsValue = BigInt(amount);

        // Get the underlying asset address for approval
        const assetAddress = await contract.asset();

        // Approve the vToken contract to spend the underlying asset
        const assetContract = new Contract(vTokenABI, assetAddress, starknetAccount);
        const approveResult = await assetContract.approve(vTokenAddress, assetsValue);
        await provider.waitForTransaction(approveResult.transaction_hash);

        // Deposit assets into the vToken vault
        const receiver = starknetAccount.address;
        const result = await contract.deposit(assetsValue, receiver);
        await provider.waitForTransaction(result.transaction_hash);

        return result.transaction_hash;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to deposit";
        setError(message);
        throw new Error(message);
      } finally {
        setIsDepositing(false);
      }
    },
    [starknetAccount]
  );

  return { deposit, isDepositing, error };
}
