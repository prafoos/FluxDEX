"use client";

import { useMemo, useState } from "react";
import {
  maxUint256,
  parseUnits,
  formatUnits,
  type Address,
  type Hash,
} from "viem";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { erc20Abi, factoryAbi, pairAbi, routerAbi } from "@/constants/abis";
import { errorMessage } from "@/lib/errors";
import { factoryAddress, routerAddress, wqmsAddress } from "@/lib/tokens";
import type { Token } from "@/types";

const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 60 * 20);

export function useSwap(from: Token, to: Token, amount: string, slippage: number) {
  const { address: account } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId: 19480 });
  const { writeContractAsync } = useWriteContract();
  const queryClient = useQueryClient();
  const [isSwapping, setIsSwapping] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string>();
  const [txHash, setTxHash] = useState<Hash>();
  const amountIn = useMemo(() => {
    try { return amount ? parseUnits(amount, from.decimals) : 0n; } catch { return 0n; }
  }, [amount, from.decimals]);
  const fromAddress = from.native ? wqmsAddress : from.address;
  const toAddress = to.native ? wqmsAddress : to.address;
  const path = fromAddress && toAddress && fromAddress.toLowerCase() !== toAddress.toLowerCase()
    ? [fromAddress, toAddress] as const : [];

  const pair = useReadContract({
    chainId: 19480,
    address: factoryAddress,
    abi: factoryAbi,
    functionName: "getPair",
    args: fromAddress && toAddress ? [fromAddress, toAddress] : undefined,
    query: { enabled: Boolean(factoryAddress && fromAddress && toAddress) },
  });
  const pairAddress = pair.data && pair.data !== "0x0000000000000000000000000000000000000000"
    ? pair.data : undefined;
  const token0 = useReadContract({
    chainId: 19480,
    address: pairAddress, abi: pairAbi, functionName: "token0",
    query: { enabled: Boolean(pairAddress) },
  });
  const reserve0 = useReadContract({
    chainId: 19480,
    address: pairAddress, abi: pairAbi, functionName: "reserve0",
    query: { enabled: Boolean(pairAddress) },
  });
  const reserve1 = useReadContract({
    chainId: 19480,
    address: pairAddress, abi: pairAbi, functionName: "reserve1",
    query: { enabled: Boolean(pairAddress) },
  });
  const quote = useReadContract({
    chainId: 19480,
    address: routerAddress,
    abi: routerAbi,
    functionName: "getAmountsOut",
    args: amountIn > 0n && path.length === 2 ? [amountIn, [...path]] : undefined,
    query: { enabled: Boolean(routerAddress && amountIn > 0n && path.length === 2) },
  });
  const allowance = useReadContract({
    chainId: 19480,
    address: from.address,
    abi: erc20Abi,
    functionName: "allowance",
    args: account && routerAddress ? [account, routerAddress] : undefined,
    query: { enabled: Boolean(account && routerAddress && from.address && !from.native) },
  });
  const impact = useMemo(() => {
    if (!amountIn || !quote.data?.[1] || !token0.data || !reserve0.data || !reserve1.data) return undefined;
    const reserveIn = token0.data.toLowerCase() === fromAddress?.toLowerCase() ? reserve0.data : reserve1.data;
    const reserveOut = token0.data.toLowerCase() === fromAddress?.toLowerCase() ? reserve1.data : reserve0.data;
    const reserveInValue = BigInt(reserveIn);
    if (reserveInValue === 0n) return undefined;
    const spotOut = amountIn * BigInt(reserveOut) / reserveInValue;
    const quotedOut = BigInt(quote.data[1]!);
    return spotOut > 0n ? Number((spotOut - quotedOut) * 10000n / spotOut) / 100 : undefined;
  }, [amountIn, quote.data, token0.data, reserve0.data, reserve1.data, fromAddress]);

  async function swap(): Promise<Hash> {
    setIsSuccess(false);
    setError(undefined);
    setTxHash(undefined);
    if (!account || !publicClient || !routerAddress || !path.length || amountIn <= 0n) {
      const message = "Connect a wallet and enter a valid amount.";
      setError(message);
      throw new Error(message);
    }
    if (chainId !== 19480) {
      const message = "Switch your wallet to QMS Testnet before swapping.";
      setError(message);
      throw new Error(message);
    }
    const amounts = quote.data;
    if (!amounts || amounts.length < 2) {
      const message = "A quote is not available for this token pair.";
      setError(message);
      throw new Error(message);
    }
    setIsSwapping(true);
    try {
      if (!from.native && from.address && (allowance.data ?? 0n) < amountIn) {
        const approvalHash = await writeContractAsync({
          address: from.address,
          abi: erc20Abi,
          functionName: "approve",
          args: [routerAddress, maxUint256],
        });
        const approvalReceipt = await publicClient.waitForTransactionReceipt({ hash: approvalHash });
        if (approvalReceipt.status !== "success") throw new Error("Token approval reverted on-chain.");
      }
      const minimum = amounts[amounts.length - 1]! * BigInt(Math.max(0, 10000 - Math.round(slippage * 100))) / 10000n;
      let hash: Hash;
      if (from.native) {
        if (!wqmsAddress) throw new Error("WQMS is not deployed yet. Deploy contracts and reload.");
        hash = await writeContractAsync({
          address: routerAddress, abi: routerAbi, functionName: "swapExactQMSForTokens",
          args: [minimum, [...path] as [Address, ...Address[]], account, deadline()],
          value: amountIn,
        });
      } else if (to.native) {
        hash = await writeContractAsync({
          address: routerAddress, abi: routerAbi, functionName: "swapExactTokensForQMS",
          args: [amountIn, minimum, [...path] as [Address, ...Address[]], account, deadline()],
        });
      } else {
        hash = await writeContractAsync({
          address: routerAddress, abi: routerAbi, functionName: "swapExactTokensForTokens",
          args: [amountIn, minimum, [...path] as [Address, ...Address[]], account, deadline()],
        });
      }
      setTxHash(hash);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Swap transaction reverted on-chain.");
      await queryClient.invalidateQueries();
      setIsSuccess(true);
      return hash;
    } catch (caught) {
      setError(errorMessage(caught));
      throw caught;
    } finally {
      setIsSwapping(false);
    }
  }

  return {
    quote: quote.data?.[quote.data.length - 1],
    isQuoting: quote.isLoading,
    quoteError: quote.error ? errorMessage(quote.error) : undefined,
    isSwapping,
    isSuccess,
    error,
    txHash,
    swap,
    amountIn,
    priceImpact: impact,
    rate: quote.data?.[quote.data.length - 1] && amountIn > 0n
      ? Number(formatUnits(quote.data[quote.data.length - 1]!, to.decimals)) /
        Number(formatUnits(amountIn, from.decimals))
      : undefined,
  };
}
