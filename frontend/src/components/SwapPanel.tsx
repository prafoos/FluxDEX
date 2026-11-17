"use client";

import { ArrowDown, ArrowDownUp, ChevronDown, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { useChainId, useSwitchChain } from "wagmi";
import { TokenPicker } from "@/components/TokenPicker";
import { useSwap } from "@/hooks/useSwap";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { errorMessage } from "@/lib/errors";
import { qmsTestnet } from "@/constants/chain";
import { deploymentReady, sameToken, tokens } from "@/lib/tokens";
import type { Token, ToastState } from "@/types";

function AmountInput({ token, amount, balance, onChange, onChoose }: {
  token: Token; amount: string; balance?: bigint; onChange: (value: string) => void; onChoose: () => void;
}) {
  const max = balance === undefined ? "0" : Number(formatUnits(balance, token.decimals)).toLocaleString(undefined, { maximumFractionDigits: 5 });
  return (
    <div className="amount-box">
      <div className="amount-top"><span>{token.symbol === "QMS" ? "You pay" : "Token amount"}</span><span>Balance: {max} <button className="max-btn" onClick={() => onChange(balance ? formatUnits(balance, token.decimals) : "0")}>MAX</button></span></div>
      <div className="amount-entry">
        <input inputMode="decimal" value={amount} onChange={(event) => onChange(event.target.value.replace(/[^\d.]/g, ""))} placeholder="0.00" aria-label={`${token.symbol} amount`} />
        <button className="token-select" onClick={onChoose}><span className={`token-icon ${token.symbol.toLowerCase()}`}>{token.symbol.slice(0, 1)}</span>{token.symbol}<ChevronDown size={16} /></button>
      </div>
    </div>
  );
}

export function SwapPanel({ notify }: { notify: (toast: ToastState) => void }) {
  const [from, setFrom] = useState<Token>(tokens[0]!);
  const [to, setTo] = useState<Token>(tokens.find((token) => token.symbol === "tUSDC") ?? tokens[1] ?? tokens[0]!);
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState(0.5);
  const [custom, setCustom] = useState("");
  const [picker, setPicker] = useState<"from" | "to">();
  const [showSettings, setShowSettings] = useState(false);
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const fromBalance = useTokenBalance(from);
  const toBalance = useTokenBalance(to);
  const swap = useSwap(from, to, amount, slippage);
  const output = !amount || swap.quote === undefined ? "" : formatUnits(swap.quote, to.decimals);

  useEffect(() => {
    if (swap.isSuccess) setAmount("");
  }, [swap.isSuccess]);

  function choose(token: Token) {
    if (picker === "from") {
      if (sameToken(token, to)) setTo(from);
      setFrom(token);
    } else {
      if (sameToken(token, from)) setFrom(to);
      setTo(token);
    }
    setPicker(undefined);
  }
  async function submit() {
    if (chainId !== qmsTestnet.id) {
      try { await switchChainAsync({ chainId: qmsTestnet.id }); }
      catch (error) { notify({ kind: "error", message: errorMessage(error) }); }
      return;
    }
    try {
      const hash = await swap.swap();
      notify({ kind: "success", message: "Swap confirmed.", hash });
    } catch (error) {
      notify({ kind: "error", message: errorMessage(error) });
    }
  }
  const impactWarning = (swap.priceImpact ?? 0) > 3;
  return (
    <section className="trade-card">
      <div className="panel-title"><div><h1>Swap</h1><p>Trade tokens instantly on QMS</p></div><button className="icon-btn" aria-label="Swap settings" onClick={() => setShowSettings(!showSettings)}><Settings2 size={19} /></button></div>
      {showSettings && <div className="settings-box"><div className="settings-title">Slippage tolerance <span>{slippage}%</span></div><div className="slippage-options">{[0.1, 0.5, 1].map((value) => <button className={slippage === value ? "selected" : ""} key={value} onClick={() => { setSlippage(value); setCustom(""); }}>{value}%</button>)}<input aria-label="Custom slippage" value={custom} placeholder="Custom" inputMode="decimal" onChange={(event) => { setCustom(event.target.value); const value = Number(event.target.value); if (value > 0 && value <= 50) setSlippage(value); }} /></div><small>High slippage can result in an unfavorable trade.</small></div>}
      <AmountInput token={from} amount={amount} balance={fromBalance.balance} onChange={setAmount} onChoose={() => setPicker("from")} />
      <div className="switch-row"><span /><button className="switch-token" onClick={() => { setFrom(to); setTo(from); }} aria-label="Switch tokens"><ArrowDown size={16} /></button><span /></div>
      <div className="amount-box">
        <div className="amount-top"><span>You receive</span><span>Balance: {toBalance.balance === undefined ? "—" : Number(formatUnits(toBalance.balance, to.decimals)).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span></div>
        <div className="amount-entry"><input value={output ? Number(output).toLocaleString(undefined, { maximumFractionDigits: 6 }) : ""} readOnly placeholder="0.00" aria-label="Estimated output" /><button className="token-select" onClick={() => setPicker("to")}><span className={`token-icon ${to.symbol.toLowerCase()}`}>{to.symbol.slice(0, 1)}</span>{to.symbol}<ChevronDown size={16} /></button></div>
      </div>
      {amount && <div className="quote-details">
        {swap.isQuoting ? <span>Fetching best quote…</span> : swap.rate !== undefined && <span>1 {from.symbol} ≈ {swap.rate.toLocaleString(undefined, { maximumFractionDigits: 6 })} {to.symbol}</span>}
        {swap.priceImpact !== undefined && <span className={impactWarning ? "warning-text" : ""}>Price impact {swap.priceImpact.toFixed(2)}%</span>}
      </div>}
      {impactWarning && <p className="inline-warning">High price impact — this trade may move the pool price significantly.</p>}
      {!deploymentReady && <p className="inline-warning">DEX contracts are not deployed yet. Deploy to QMS Testnet and reload this page.</p>}
      {(swap.error || swap.quoteError) && <p className="inline-error">{swap.error ?? swap.quoteError}</p>}
      <button className="primary-btn" disabled={swap.isSwapping || !amount || !output} onClick={submit}>
        {swap.isSwapping ? <><span className="spinner" /> Confirming transaction…</> : chainId !== qmsTestnet.id ? "Switch to QMS Testnet" : !amount ? "Enter an amount" : !output ? "No route found" : "Swap"}
      </button>
      <div className="fee-note"><ArrowDownUp size={13} /> 0.30% pool fee · Slippage {slippage}%</div>
      {picker && <TokenPicker onSelect={choose} onClose={() => setPicker(undefined)} />}
    </section>
  );
}
