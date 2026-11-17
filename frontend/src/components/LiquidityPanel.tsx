"use client";

import { useEffect, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { useAccount } from "wagmi";
import { TokenPicker } from "@/components/TokenPicker";
import { useLiquidity } from "@/hooks/useLiquidity";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { errorMessage } from "@/lib/errors";
import { deploymentReady, sameToken, tokens } from "@/lib/tokens";
import type { Token, ToastState } from "@/types";
import { ChevronDown, Plus, Minus, ArrowDown } from "lucide-react";

function PairToken({ token, onClick }: { token: Token; onClick: () => void }) {
  return <button className="token-select" onClick={onClick}><span className={`token-icon ${token.symbol.toLowerCase()}`}>{token.symbol.slice(0, 1)}</span>{token.symbol}<ChevronDown size={16} /></button>;
}

function quoteAmount(amount: string, decimalsIn: number, decimalsOut: number, reserveIn: bigint, reserveOut: bigint) {
  if (!/^\d*\.?\d*$/.test(amount) || !/\d/.test(amount)) return "";
  const normalized = amount.endsWith(".") ? amount.slice(0, -1) : amount;
  const [whole = "", fraction = ""] = normalized.split(".");
  if (fraction.length > decimalsIn) return "";
  const parsedAmount = `${whole || "0"}${fraction ? `.${fraction}` : ""}`;
  const output = parseUnits(parsedAmount, decimalsIn) * reserveOut / reserveIn;
  const formatted = formatUnits(output, decimalsOut);
  return formatted.includes(".") ? formatted.replace(/0+$/, "").replace(/\.$/, "") : formatted;
}

export function LiquidityPanel({ notify }: { notify: (toast: ToastState) => void }) {
  const [mode, setMode] = useState<"add" | "remove">("add");
  const [tokenA, setTokenA] = useState<Token>(tokens[0]!);
  const [tokenB, setTokenB] = useState<Token>(tokens.find((token) => token.symbol === "tUSDC") ?? tokens[1] ?? tokens[0]!);
  const [amountA, setAmountA] = useState("");
  const [amountB, setAmountB] = useState("");
  const [lastEdited, setLastEdited] = useState<"A" | "B">("A");
  const [percent, setPercent] = useState(50);
  const [picker, setPicker] = useState<"a" | "b">();
  const { address } = useAccount();
  const balanceA = useTokenBalance(tokenA);
  const balanceB = useTokenBalance(tokenB);
  const lp = useLiquidity(tokenA, tokenB, amountA, amountB);

  function choose(token: Token) {
    if (picker === "a") {
      if (sameToken(token, tokenB)) setTokenB(tokenA);
      setTokenA(token);
    } else {
      if (sameToken(token, tokenA)) setTokenA(tokenB);
      setTokenB(token);
    }
    setPicker(undefined);
  }
  useEffect(() => {
    if (lastEdited === "A") {
      if (!amountA) {
        setAmountB("");
      } else if (lp.reserveA && lp.reserveB && lp.reserveA > 0n && lp.reserveB > 0n) {
        setAmountB(quoteAmount(amountA, tokenA.decimals, tokenB.decimals, lp.reserveA, lp.reserveB));
      }
    } else if (!amountB) {
      setAmountA("");
    } else if (lp.reserveA && lp.reserveB && lp.reserveA > 0n && lp.reserveB > 0n) {
      setAmountA(quoteAmount(amountB, tokenB.decimals, tokenA.decimals, lp.reserveB, lp.reserveA));
    }
  }, [amountA, amountB, lastEdited, lp.reserveA, lp.reserveB, tokenA.decimals, tokenB.decimals]);

  function setFirst(value: string) {
    setLastEdited("A");
    setAmountA(value);
  }
  function setSecond(value: string) {
    setLastEdited("B");
    setAmountB(value);
  }
  async function addLiquidity() {
    try {
      const hash = await lp.add();
      setAmountA("");
      setAmountB("");
      notify({ kind: "success", message: "Liquidity added.", hash });
    } catch (error) { notify({ kind: "error", message: errorMessage(error) }); }
  }
  async function removeLiquidity() {
    try {
      const hash = await lp.remove(percent);
      setAmountA("");
      setAmountB("");
      notify({ kind: "success", message: "Liquidity removed.", hash });
    } catch (error) { notify({ kind: "error", message: errorMessage(error) }); }
  }
  const lpDisplay = lp.lpBalance ? Number(formatUnits(lp.lpBalance, 18)).toLocaleString(undefined, { maximumFractionDigits: 6 }) : "0";
  return (
    <section className="trade-card liquidity-card">
      <div className="panel-title"><div><h1>Liquidity</h1><p>Provide liquidity and earn swap fees</p></div><span className="fee-pill">0.30% fee tier</span></div>
      <div className="segmented"><button className={mode === "add" ? "active" : ""} onClick={() => setMode("add")}><Plus size={15} /> Add</button><button className={mode === "remove" ? "active" : ""} onClick={() => setMode("remove")}><Minus size={15} /> Remove</button></div>
      {!deploymentReady && <p className="inline-warning">DEX contracts are not deployed yet. Deploy to QMS Testnet and reload this page.</p>}
      {mode === "add" ? <>
        <div className="amount-box"><div className="amount-top"><span>Token A</span><span>Balance {balanceA.balance === undefined ? "—" : Number(formatUnits(balanceA.balance, tokenA.decimals)).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span></div><div className="amount-entry"><input value={amountA} onChange={(event) => setFirst(event.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="0.00" /><PairToken token={tokenA} onClick={() => setPicker("a")} /></div></div>
        <div className="switch-row"><span /><span className="plus-indicator"><Plus size={16} /></span><span /></div>
        <div className="amount-box"><div className="amount-top"><span>Token B</span><span>Balance {balanceB.balance === undefined ? "—" : Number(formatUnits(balanceB.balance, tokenB.decimals)).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span></div><div className="amount-entry"><input value={amountB} onChange={(event) => setSecond(event.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="0.00" /><PairToken token={tokenB} onClick={() => setPicker("b")} /></div></div>
        <div className="position-row"><span>Pool</span><span>{tokenA.symbol} / {tokenB.symbol}</span></div>
        <div className="position-row"><span>Estimated pool share</span><span>{amountA && amountB ? "Calculated on deposit" : "—"}</span></div>
        <button className="primary-btn" disabled={lp.busy || !address || !amountA || !amountB} onClick={addLiquidity}>{lp.busy ? <><span className="spinner" /> Confirming…</> : !address ? "Connect wallet to add" : "Add liquidity"}</button>
      </> : <>
        <div className="position-card"><div className="position-card-header"><span className="token-pair-icons"><i>{tokenA.symbol.slice(0, 1)}</i><i>{tokenB.symbol.slice(0, 1)}</i></span><div><strong>{tokenA.symbol} / {tokenB.symbol}</strong><small>FluxDEX · 0.30% fee</small></div><button className="change-pair" onClick={() => setPicker("a")}>Change</button></div>
          <div className="position-stats"><span>LP balance</span><strong>{lpDisplay}</strong><span>Your pool share</span><strong>{lp.share.toFixed(4)}%</strong></div>
        </div>
        {lp.lpBalance && lp.lpBalance > 0n ? <>
          <div className="range-label"><span>Remove amount</span><strong>{percent}%</strong></div>
          <input className="range-input" aria-label="Percentage of liquidity to remove" type="range" min="1" max="100" value={percent} onChange={(event) => setPercent(Number(event.target.value))} />
          <div className="range-quick">{[25, 50, 75, 100].map((value) => <button key={value} className={percent === value ? "selected" : ""} onClick={() => setPercent(value)}>{value}%</button>)}</div>
          <button className="primary-btn" disabled={lp.busy} onClick={removeLiquidity}>{lp.busy ? <><span className="spinner" /> Confirming…</> : <><ArrowDown size={16} /> Remove {percent}% liquidity</>}</button>
        </> : <div className="empty-position">No active LP position found for this pair.</div>}
      </>}
      {lp.error && <p className="inline-error">{lp.error}</p>}
      {picker && <TokenPicker onSelect={choose} onClose={() => setPicker(undefined)} />}
    </section>
  );
}
