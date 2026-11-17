"use client";

import { useMemo, useState } from "react";
import { maxUint256, parseUnits, type Address, type Hash } from "viem";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from "wagmi";
import { erc20Abi, factoryAbi, pairAbi, routerAbi } from "@/constants/abis";
import { errorMessage } from "@/lib/errors";
import { factoryAddress, routerAddress, wqmsAddress } from "@/lib/tokens";
import type { Token } from "@/types";

const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 60 * 20);

export function useLiquidity(tokenA: Token, tokenB: Token, amountA: string, amountB: string) {
  const { address: account } = useAccount();
  const chainId = useChainId();
  const client = usePublicClient({ chainId: 19480 });
  const { writeContractAsync } = useWriteContract();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [txHash, setTxHash] = useState<Hash>();
  const addressA = tokenA.native ? wqmsAddress : tokenA.address;
  const addressB = tokenB.native ? wqmsAddress : tokenB.address;
  const pair = useReadContract({
    chainId: 19480,
    address: factoryAddress,
    abi: factoryAbi,
    functionName: "getPair",
    args: addressA && addressB ? [addressA, addressB] : undefined,
    query: { enabled: Boolean(factoryAddress && addressA && addressB) },
  });
  const pairAddress = pair.data && pair.data !== "0x0000000000000000000000000000000000000000"
    ? pair.data : undefined;
  const lpBalance = useReadContract({
    chainId: 19480,
    address: pairAddress,
    abi: pairAbi,
    functionName: "balanceOf",
    args: account ? [account] : undefined,
    query: { enabled: Boolean(pairAddress && account) },
  });
  const lpSupply = useReadContract({
    chainId: 19480,
    address: pairAddress, abi: pairAbi, functionName: "totalSupply",
    query: { enabled: Boolean(pairAddress) },
  });
  const pairToken0 = useReadContract({
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
  const amountAWei = useMemo(() => {
    try { return amountA ? parseUnits(amountA, tokenA.decimals) : 0n; } catch { return 0n; }
  }, [amountA, tokenA.decimals]);
  const amountBWei = useMemo(() => {
    try { return amountB ? parseUnits(amountB, tokenB.decimals) : 0n; } catch { return 0n; }
  }, [amountB, tokenB.decimals]);

  async function approve(token: Token, value: bigint) {
    if (!token.address || !account || !routerAddress || !client) return;
    const current = await client.readContract({
      address: token.address, abi: erc20Abi, functionName: "allowance",
      args: [account, routerAddress],
    });
    if (current < value) {
      const hash = await writeContractAsync({
        address: token.address, abi: erc20Abi, functionName: "approve",
        args: [routerAddress, maxUint256],
      });
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`${token.symbol} approval reverted on-chain.`);
    }
  }

  async function add(): Promise<Hash> {
    setError(undefined);
    setTxHash(undefined);
    if (!account || !client || !routerAddress || !addressA || !addressB || !amountAWei || !amountBWei) {
      const message = "Connect a wallet and enter both amounts.";
      setError(message);
      throw new Error(message);
    }
    if (addressA.toLowerCase() === addressB.toLowerCase()) {
      const message = "Choose two different tokens.";
      setError(message);
      throw new Error(message);
    }
    if (chainId !== 19480) { setError("Switch your wallet to QMS Testnet."); throw new Error("Switch your wallet to QMS Testnet."); }
    setBusy(true);
    try {
      if (!tokenA.native) await approve(tokenA, amountAWei);
      if (!tokenB.native) await approve(tokenB, amountBWei);
      const qmsToken = tokenA.native ? tokenB : tokenA;
      const tokenValue = tokenA.native ? amountBWei : amountAWei;
      const qmsValue = tokenA.native ? amountAWei : amountBWei;
      let hash: Hash;
      if (tokenA.native || tokenB.native) {
        hash = await writeContractAsync({
          address: routerAddress, abi: routerAbi, functionName: "addLiquidityQMS",
          args: [qmsToken.address!, tokenValue, 0n, 0n, account, deadline()],
          value: qmsValue,
        });
      } else {
        hash = await writeContractAsync({
          address: routerAddress, abi: routerAbi, functionName: "addLiquidity",
          args: [addressA, addressB, amountAWei, amountBWei, 0n, 0n, account, deadline()],
        });
      }
      setTxHash(hash);
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Liquidity transaction reverted on-chain.");
      await queryClient.invalidateQueries();
      return hash;
    } catch (caught) { setError(errorMessage(caught)); throw caught; }
    finally { setBusy(false); }
  }

  async function remove(percent: number): Promise<Hash> {
    setError(undefined);
    setTxHash(undefined);
    if (!account || !client || !routerAddress || !pairAddress || !lpBalance.data || !addressA || !addressB) {
      const message = "No liquidity position was found for this pair.";
      setError(message);
      throw new Error(message);
    }
    if (chainId !== 19480) { setError("Switch your wallet to QMS Testnet."); throw new Error("Switch your wallet to QMS Testnet."); }
    const liquidity = lpBalance.data * BigInt(percent) / 100n;
    if (liquidity === 0n) { setError("Select a non-zero LP amount."); throw new Error("Select a non-zero LP amount."); }
    setBusy(true);
    try {
      const approval = await writeContractAsync({
        address: pairAddress, abi: pairAbi, functionName: "approve",
        args: [routerAddress, liquidity],
      });
      const approvalReceipt = await client.waitForTransactionReceipt({ hash: approval });
      if (approvalReceipt.status !== "success") throw new Error("LP-token approval reverted on-chain.");
      const hash = tokenA.native || tokenB.native
        ? await writeContractAsync({
          address: routerAddress, abi: routerAbi, functionName: "removeLiquidityQMS",
          args: [(tokenA.native ? tokenB : tokenA).address!, liquidity, 0n, 0n, account, deadline()],
        })
        : await writeContractAsync({
          address: routerAddress, abi: routerAbi, functionName: "removeLiquidity",
          args: [addressA, addressB, liquidity, 0n, 0n, account, deadline()],
        });
      setTxHash(hash);
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Liquidity removal reverted on-chain.");
      await queryClient.invalidateQueries();
      return hash;
    } catch (caught) { setError(errorMessage(caught)); throw caught; }
    finally { setBusy(false); }
  }

  const share = lpBalance.data && lpSupply.data && lpSupply.data > 0n
    ? Number(lpBalance.data * 10000n / lpSupply.data) / 100 : 0;
  const reserveA = pairToken0.data?.toLowerCase() === addressA?.toLowerCase() ? reserve0.data : reserve1.data;
  const reserveB = pairToken0.data?.toLowerCase() === addressA?.toLowerCase() ? reserve1.data : reserve0.data;
  return { pairAddress, lpBalance: lpBalance.data, share, add, remove, busy, error, txHash, reserveA, reserveB };
}
