"use client";

import { Droplets, ExternalLink } from "lucide-react";
import { useState } from "react";
import { type Hash } from "viem";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { erc20Abi } from "@/constants/abis";
import { errorMessage } from "@/lib/errors";
import { tokens } from "@/lib/tokens";
import type { ToastState, Token } from "@/types";

const nativeFaucetUrl = "https://faucet.testnet.qms.finance/";

export function FaucetPanel({ notify }: { notify: (toast: ToastState) => void }) {
  const { address } = useAccount();
  const client = usePublicClient({ chainId: 19480 });
  const { writeContractAsync } = useWriteContract();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string>();
  const faucetTokens = tokens.filter((token) =>
    token.address && (token.symbol === "tUSDC" || token.symbol === "tUSDT"),
  );

  async function requestFaucet(token: Token) {
    if (!token.address || !address || !client) return;
    setBusy(token.symbol);
    try {
      const hash: Hash = await writeContractAsync({
        address: token.address, abi: erc20Abi, functionName: "faucet",
      });
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Faucet transaction reverted on-chain.");
      await queryClient.invalidateQueries();
      notify({ kind: "success", message: `${token.symbol} tokens minted to your wallet.`, hash });
    } catch (error) {
      notify({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusy(undefined);
    }
  }

  return <section className="trade-card faucet-card">
    <div className="faucet-hero"><span className="faucet-symbol"><Droplets size={23} /></span><span className="eyebrow">TESTNET TOOLS</span><h1>Token faucet</h1><p>Get QMS for gas from the official faucet, or mint test tokens when their contracts are deployed.</p></div>
    <div className="faucet-list">
      <div className="faucet-row">
        <span className="token-icon qms">Q</span>
        <div className="faucet-token-name"><strong>QMS Testnet</strong><small>Native gas token</small></div>
        <a className="outline-btn" href={nativeFaucetUrl} target="_blank" rel="noreferrer">Claim QMS <ExternalLink size={12} /></a>
      </div>
      {faucetTokens.map((token) => <div className="faucet-row" key={token.address}>
        <span className={`token-icon ${token.symbol.toLowerCase()}`}>{token.symbol.slice(0, 1)}</span>
        <div className="faucet-token-name"><strong>{token.name}</strong><small>{token.symbol} · Testnet</small></div>
        <button className="outline-btn" disabled={!address || !client || busy === token.symbol} onClick={() => void requestFaucet(token)}>
          {busy === token.symbol ? <><span className="spinner" /> Minting</> : "Get tokens"}
        </button>
      </div>)}
      {faucetTokens.length === 0 && <div className="faucet-unavailable">Test USDC and Test USDT faucet contracts are not deployed yet. The QMS gas faucet above is available now.</div>}
    </div>
    {!address && <p className="faucet-footnote">Connect your wallet to mint deployed test tokens.</p>}
    <p className="faucet-footnote">External USDT, USDC, WETH, WBTC, and WQMS contracts do not provide a permissionless faucet.</p>
    <div className="testnet-note">Testnet only <a href="https://testnet.qmsscan.io" target="_blank" rel="noreferrer">QMSScan <ExternalLink size={12} /></a></div>
  </section>;
}
