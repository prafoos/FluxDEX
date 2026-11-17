"use client";

import { Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatUnits, getAddress, isAddress } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { erc20Abi } from "@/constants/abis";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { errorMessage } from "@/lib/errors";
import { customTokensStorageKey, sameToken, tokens } from "@/lib/tokens";
import type { Token } from "@/types";

function isStoredToken(value: unknown): value is Token {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.name === "string" &&
    typeof candidate.symbol === "string" &&
    typeof candidate.decimals === "number" &&
    Number.isInteger(candidate.decimals) &&
    candidate.decimals >= 0 &&
    candidate.decimals <= 255 &&
    typeof candidate.address === "string" &&
    isAddress(candidate.address);
}

function TokenRow({ token, onSelect }: { token: Token; onSelect: (token: Token) => void }) {
  const { balance, isLoading, errorText } = useTokenBalance(token);
  const shown = balance === undefined ? "—" : Number(formatUnits(balance, token.decimals)).toLocaleString(undefined, { maximumFractionDigits: 4 });
  return (
    <button className="token-row" onClick={() => onSelect(token)}>
      <span className={`token-icon ${token.symbol.toLowerCase()}`}>{token.symbol.slice(0, 1)}</span>
      <span className="token-name"><strong>{token.symbol}</strong><small>{token.name}</small></span>
      <span className="token-balance" title={errorText}>{isLoading ? "…" : errorText ? "Error" : shown}</span>
    </button>
  );
}

export function TokenPicker({ onSelect, onClose }: { onSelect: (token: Token) => void; onClose: () => void }) {
  const [search, setSearch] = useState("");
  const [customTokens, setCustomTokens] = useState<Token[]>([]);
  const [preview, setPreview] = useState<{ token: Token; balance?: bigint }>();
  const [isResolving, setIsResolving] = useState(false);
  const [errorText, setErrorText] = useState<string>();
  const [storageErrorText, setStorageErrorText] = useState<string>();
  const { address } = useAccount();
  const client = usePublicClient({ chainId: 19480 });
  const availableTokens = useMemo(() => [...tokens, ...customTokens], [customTokens]);
  const filtered = useMemo(() => availableTokens.filter((token) =>
    `${token.name} ${token.symbol} ${token.address ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()),
  ), [availableTokens, search]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(customTokensStorageKey);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (!Array.isArray(parsed) || !parsed.every(isStoredToken)) {
          throw new Error("Saved custom tokens have an invalid format.");
        }
        setCustomTokens(parsed);
      }
    } catch (error) {
      setStorageErrorText(errorMessage(error));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const enteredAddress = search.trim();
    setPreview(undefined);
    setErrorText(undefined);
    setIsResolving(false);

    if (!isAddress(enteredAddress)) return () => { cancelled = true; };

    const normalizedAddress = getAddress(enteredAddress.toLowerCase());
    if (availableTokens.some((token) => token.address?.toLowerCase() === normalizedAddress.toLowerCase())) {
      return () => { cancelled = true; };
    }

    const timeout = window.setTimeout(() => {
      if (!client) {
        setErrorText("QMS Testnet RPC is unavailable.");
        return;
      }
      setIsResolving(true);
      void (async () => {
        try {
          const code = await client.getCode({ address: normalizedAddress });
          if (!code || code === "0x") throw new Error("No contract was found at this address on QMS Testnet.");
          const [name, symbol, decimals, balance] = await Promise.all([
            client.readContract({ address: normalizedAddress, abi: erc20Abi, functionName: "name" }),
            client.readContract({ address: normalizedAddress, abi: erc20Abi, functionName: "symbol" }),
            client.readContract({ address: normalizedAddress, abi: erc20Abi, functionName: "decimals" }),
            address
              ? client.readContract({ address: normalizedAddress, abi: erc20Abi, functionName: "balanceOf", args: [address] })
              : Promise.resolve(undefined),
          ]);
          if (cancelled) return;
          if (!name.trim() || !symbol.trim()) throw new Error("The contract returned invalid ERC-20 metadata.");
          setPreview({
            token: { address: normalizedAddress, name, symbol, decimals: Number(decimals) },
            balance,
          });
        } catch (error) {
          if (!cancelled) setErrorText(errorMessage(error));
        } finally {
          if (!cancelled) setIsResolving(false);
        }
      })();
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [address, availableTokens, client, search]);

  function importToken(token: Token) {
    const updated = [...customTokens.filter((saved) => !sameToken(saved, token)), token];
    try {
      localStorage.setItem(customTokensStorageKey, JSON.stringify(updated));
      setCustomTokens(updated);
      onSelect(token);
    } catch (error) {
      setErrorText(errorMessage(error));
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="token-modal" aria-modal="true" role="dialog" aria-label="Select a token">
        <header className="modal-heading"><div><h2>Select a token</h2><p>Available on QMS Testnet</p></div><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={19} /></button></header>
        <label className="search-field"><Search size={17} /><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or address" /></label>
        {isAddress(search.trim()) &&
          !availableTokens.some((token) => token.address?.toLowerCase() === search.trim().toLowerCase()) && (
            <div className="import-preview">
              {isResolving ? <span>Loading token details…</span> : preview ? <>
                <span className={`token-icon ${preview.token.symbol.toLowerCase()}`}>{preview.token.symbol.slice(0, 1)}</span>
                <span className="import-token-details">
                  <strong>{preview.token.symbol} <small>{preview.token.name}</small></strong>
                  <small>{address ? `Balance: ${preview.balance === undefined ? "—" : Number(formatUnits(preview.balance, preview.token.decimals)).toLocaleString(undefined, { maximumFractionDigits: 4 })}` : "Connect a wallet to view balance"}</small>
                </span>
                <button className="outline-btn" type="button" onClick={() => importToken(preview.token)}>Import</button>
              </> : errorText ? <span className="inline-error">{errorText}</span> : null}
            </div>
          )}
        {(errorText ?? storageErrorText) && !preview && <p className="inline-error">{errorText ?? storageErrorText}</p>}
        <div className="token-list">
          {filtered.map((token) => <TokenRow key={token.address ?? "native-qms"} token={token} onSelect={onSelect} />)}
          {filtered.length === 0 && !preview && !isResolving && !errorText && <p className="empty-note">No matching tokens.</p>}
        </div>
      </section>
    </div>
  );
}
