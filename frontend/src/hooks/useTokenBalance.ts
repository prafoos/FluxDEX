"use client";

import { useAccount, useBalance, useReadContract } from "wagmi";
import { erc20Abi } from "@/constants/abis";
import { errorMessage } from "@/lib/errors";
import type { Token } from "@/types";

export function useTokenBalance(token: Token | undefined) {
  const { address } = useAccount();
  const nativeBalance = useBalance({
    address,
    chainId: 19480,
    query: { enabled: Boolean(address && token?.native) },
  });
  const balance = useReadContract({
    chainId: 19480,
    abi: erc20Abi,
    address: token?.address,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && token?.address) },
  });
  return {
    balance: token?.native ? nativeBalance.data?.value : balance.data,
    isLoading: token?.native ? nativeBalance.isLoading : balance.isLoading,
    error: token?.native ? nativeBalance.error : balance.error,
    errorText: token?.native
      ? nativeBalance.error ? errorMessage(nativeBalance.error) : undefined
      : balance.error ? errorMessage(balance.error) : undefined,
  };
}
