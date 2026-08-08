"use client";

import {useEffect, useState} from "react";
import {useAccount, useConnect, useDisconnect, useSwitchChain, useWriteContract} from "wagmi";
import {monadTestnet} from "@/lib/strata";
import {POOL, poolWriteAbi, EXPLORER_TX} from "@/lib/contracts";

const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
type Cred = {tier?: string; status?: number} | null;

export function WalletPanel() {
  const {address, isConnected, chainId} = useAccount();
  const {connect, connectors, isPending} = useConnect();
  const {disconnect} = useDisconnect();
  const {switchChain} = useSwitchChain();
  const {writeContract, data: txHash, isPending: txPending, error: txError} = useWriteContract();

  const [cred, setCred] = useState<Cred>(null);
  const injected = connectors.find((c) => c.type === "injected") ?? connectors[0];
  const wrongNetwork = isConnected && chainId !== monadTestnet.id;

  useEffect(() => {
    if (!address) return setCred(null);
    let live = true;
    fetch(`/api/apass?address=${address}`)
      .then((r) => r.json())
      .then((j) => live && setCred(j.data ?? j ?? null))
      .catch(() => live && setCred(null));
    return () => {
      live = false;
    };
  }, [address]);

  if (!isConnected) {
    return (
      <div className="wallet">
        <div className="wallet-label">WALLET</div>
        <button className="wallet-connect" disabled={isPending} onClick={() => connect({connector: injected})}>
          {isPending ? "Connecting…" : "Connect wallet"}
        </button>
        <p className="wallet-hint">MetaMask or a compatible browser extension.</p>
      </div>
    );
  }

  return (
    <div className="wallet">
      <div className="wallet-label">WALLET</div>
      <div className="wallet-addr">{short(address)}</div>
      <div className={`wallet-net ${wrongNetwork ? "bad" : "ok"}`}>
        {wrongNetwork ? "wrong network" : "monad testnet"}
      </div>
      {wrongNetwork && (
        <button className="wallet-mini" onClick={() => switchChain({chainId: monadTestnet.id})}>
          Switch to Monad
        </button>
      )}
      <div className="wallet-cred">
        <span>A-Pass</span>
        {cred?.tier ? <b style={{color: "var(--verified)"}}>tier {cred.tier}</b>
                    : <b style={{color: "var(--ink-dim)"}}>none</b>}
      </div>
      {!wrongNetwork && (
        <button className="wallet-tx" disabled={txPending}
          onClick={() => writeContract({address: POOL, abi: poolWriteAbi, functionName: "syncStratum", args: [1]})}>
          {txPending ? "Confirm in wallet…" : "Sync compliance state ↗"}
        </button>
      )}
      <p className="wallet-hint">A real on-chain transaction to the pool. Permissionless, no token balance needed.</p>
      {txHash && (
        <a className="wallet-txlink" href={EXPLORER_TX(txHash)} target="_blank" rel="noreferrer">
          tx {short(txHash)} ↗
        </a>
      )}
      {txError && <p className="wallet-err">{txError.message.split("\n")[0].slice(0, 90)}</p>}
      <button className="wallet-mini ghost" onClick={() => disconnect()}>Disconnect</button>
    </div>
  );
}
