import { useState, useCallback } from "react";
import { Contract, RpcProvider } from "starknet";
import { useWallet } from "@/store/useWallet";
import { RPC_URL } from "@/lib/constants";
import vTokenABI from "@/lib/vesu/abi.json";

export interface UseVesuWithdrawResult {
  withdraw: (amount: string, vTokenAddress: string) => Promise<string>;
  maxWithdraw: string;
  fetchMaxWithdraw: (vTokenAddress: string) => Promise<void>;
  isWithdrawing: boolean;
  error: string | null;
}

export function useVesuWithdraw(): UseVesuWithdrawResult {
  const { starknetAccount } = useWallet();
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [maxWithdraw, setMaxWithdraw] = useState("0");
  const [error, setError] = useState<string | null>(null);

  const fetchMaxWithdraw = useCallback(
    async (vTokenAddress: string) => {
      if (!starknetAccount || !vTokenAddress) {
        setMaxWithdraw("0");
        return;
      }
      try {
        const provider = new RpcProvider({ nodeUrl: RPC_URL });
        const contract = new Contract(vTokenABI, vTokenAddress, provider);
        const result = await contract.max_withdraw(starknetAccount.address);
        setMaxWithdraw(result.toString());
      } catch {
        setMaxWithdraw("0");
      }
    },
    [starknetAccount]
  );

  const withdraw = useCallback(
    async (amount: string, vTokenAddress: string): Promise<string> => {
      if (!starknetAccount) {
        throw new Error("Starknet account not connected");
      }
      if (!vTokenAddress) {
        throw new Error("V-Token address not provided");
      }

      setIsWithdrawing(true);
      setError(null);

      try {
        const provider = new RpcProvider({ nodeUrl: RPC_URL });
        const contract = new Contract(vTokenABI, vTokenAddress, starknetAccount);

        const assetsValue = BigInt(amount);
        const receiver = starknetAccount.address;
        const owner = starknetAccount.address;

        const result = await contract.withdraw(assetsValue, receiver, owner);
        await provider.waitForTransaction(result.transaction_hash);

        // Refresh max withdraw after successful withdrawal
        await fetchMaxWithdraw(vTokenAddress);

        return result.transaction_hash;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to withdraw";
        setError(message);
        throw new Error(message);
      } finally {
        setIsWithdrawing(false);
      }
    },
    [starknetAccount, fetchMaxWithdraw]
  );

  return { withdraw, maxWithdraw, fetchMaxWithdraw, isWithdrawing, error };
}
