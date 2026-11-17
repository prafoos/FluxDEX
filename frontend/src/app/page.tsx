"use client";

import { ArrowUpRight, CircleCheck, CircleX, ExternalLink, Waves } from "lucide-react";
import { useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { FaucetPanel } from "@/components/FaucetPanel";
import { LiquidityPanel } from "@/components/LiquidityPanel";
import { SwapPanel } from "@/components/SwapPanel";
import { errorMessage } from "@/lib/errors";
import type { ToastState } from "@/types";

type Tab = "swap" | "liquidity" | "faucet";

export default function Home() {
  const [tab, setTab] = useState<Tab>("swap");
  const [toast, setToast] = useState<ToastState>();
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const wrongNetwork = isConnected && chainId !== 19480;
  const showToast = (value: ToastState) => {
    setToast(value);
    window.setTimeout(() => setToast((current) => current === value ? undefined : current), 8000);
  };
  async function switchNetwork() {
    try { await switchChainAsync({ chainId: 19480 }); }
    catch (error) { showToast({ kind: "error", message: errorMessage(error) }); }
  }
  return (
    <main className="app-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <header className="topbar">
        <a className="brand" href="/" aria-label="FluxDEX home"><span className="brand-mark"><Waves size={22} strokeWidth={2.5} /></span><span>Flux<span className="brand-light">DEX</span><small>DECENTRALIZED EXCHANGE</small></span></a>
        <div className="topbar-actions"><a className="explorer-link" href="https://testnet.qmsscan.io" target="_blank" rel="noreferrer">Explorer <ExternalLink size={13} /></a><div className={`network-pill ${wrongNetwork ? "network-wrong" : ""}`}><span className="online-dot" />{wrongNetwork ? "Wrong network" : "QMS Testnet"}</div><ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" /></div>
      </header>
      {wrongNetwork && <button className="network-banner" onClick={switchNetwork} disabled={switching}><span>Connected to the wrong network. Switch to QMS Testnet to continue.</span><strong>{switching ? "Switching…" : "Switch network"} <ArrowUpRight size={14} /></strong></button>}
      <div className="main-content">
        <div className="welcome-line"><span className="status-beam" /> FLUXDEX · OPEN LIQUIDITY ON QMS</div>
        <nav className="main-tabs" aria-label="DEX feature tabs">
          {(["swap", "liquidity", "faucet"] as const).map((value) => <button key={value} className={tab === value ? "current" : ""} onClick={() => setTab(value)}>{value === "swap" ? "Swap" : value === "liquidity" ? "Liquidity" : "Faucet"}{tab === value && <span />}</button>)}
        </nav>
        {tab === "swap" ? <SwapPanel notify={showToast} /> : tab === "liquidity" ? <LiquidityPanel notify={showToast} /> : <FaucetPanel notify={showToast} />}
        <div className="security-caption"><span className="lock-mark">✓</span> Non-custodial · Trades settle on QMS Testnet</div>
      </div>
      <footer className="footer"><span>FluxDEX <b>·</b> QMS Testnet environment</span><a href="https://testnet.qmsscan.io" target="_blank" rel="noreferrer">View network <ArrowUpRight size={13} /></a></footer>
      {toast && <div className={`toast toast-${toast.kind}`} role="status">{toast.kind === "success" ? <CircleCheck size={18} /> : <CircleX size={18} />}<div><strong>{toast.message}</strong>{toast.hash && <a href={`https://testnet.qmsscan.io/tx/${toast.hash}`} target="_blank" rel="noreferrer">View transaction <ExternalLink size={12} /></a>}</div><button onClick={() => setToast(undefined)} aria-label="Dismiss notification">×</button></div>}
    </main>
  );
}
