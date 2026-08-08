"use client";

import {useEffect, useMemo, useState} from "react";
import {
  useAccount, useConnect, useDisconnect, useSwitchChain, useWriteContract,
  useReadContract, useWaitForTransactionReceipt,
} from "wagmi";
import {monadTestnet} from "@/lib/strata";
import {POOL, USDC, AUSDC, poolWriteAbi, erc20Abi, EXPLORER_TX} from "@/lib/contracts";
import {poolReadAbi, BRANCH, REASON, fmtUsdc} from "@/lib/strata";

const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
type Cred = {tier?: string; status?: number} | null;

function useApproval(token: `0x${string}`, amount: bigint | undefined) {
  const {address} = useAccount();
  const {data, refetch} = useReadContract({
    address: token, abi: erc20Abi, functionName: "allowance",
    args: address ? [address, POOL] : undefined, chainId: monadTestnet.id,
  });
  const {writeContract, data: txHash, isPending, error} = useWriteContract();
  const {data: receipt} = useWaitForTransactionReceipt({hash: txHash, chainId: monadTestnet.id});

  const needsApproval = useMemo(() => {
    if (amount === undefined || amount === 0n) return false;
    return data !== undefined && data < amount;
  }, [data, amount]);

  useEffect(() => {
    if (receipt) refetch();
  }, [receipt, refetch]);

  return {needsApproval, approve: () => writeContract({
    address: token, abi: erc20Abi, functionName: "approve",
    args: [POOL, 2n ** 256n - 1n],
  }), approvePending: isPending, approveHash: txHash, approveError: error};
}

export function WalletPanel() {
  const {address, isConnected, chainId} = useAccount();
  const {connect, connectors, isPending} = useConnect();
  const {disconnect} = useDisconnect();
  const {switchChain} = useSwitchChain();
  const {writeContract, data: txHash, isPending: txPending, error: txError} = useWriteContract();
  const {data: txReceipt} = useWaitForTransactionReceipt({hash: txHash, chainId: monadTestnet.id});

  const [cred, setCred] = useState<Cred>(null);
  const [amount, setAmount] = useState("");
  const [useAToken, setUseAToken] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const injected = connectors.find((c) => c.type === "injected") ?? connectors[0];
  const wrongNetwork = isConnected && chainId !== monadTestnet.id;

  // Real position reads from the contract.
  const {data: sharesHeld} = useReadContract({
    address: POOL, abi: poolReadAbi, functionName: "balanceOf",
    args: address ? [address] : undefined, chainId: monadTestnet.id,
  });
  const {data: cvi} = useReadContract({
    address: POOL, abi: poolReadAbi, functionName: "credentialOf",
    args: address ? [address] : undefined, chainId: monadTestnet.id,
  });
  const {data: deferred} = useReadContract({
    address: POOL, abi: poolReadAbi, functionName: "deferredShares",
    args: cvi ? [cvi[0]] : undefined, chainId: monadTestnet.id,
  });
  const withdrawShares = useMemo(() => {
    if (!withdrawAmount) return 0n;
    const n = Number(withdrawAmount);
    if (!Number.isFinite(n) || n <= 0) return 0n;
    return BigInt(Math.floor(n * 1e6));
  }, [withdrawAmount]);
  const {data: plan} = useReadContract({
    address: POOL, abi: poolReadAbi, functionName: "previewExit",
    args: address && withdrawShares > 0n ? [address, withdrawShares] : undefined,
    chainId: monadTestnet.id,
  });

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

  // Deposit amount in base units, or 0 when the input is not a valid number.
  const depositAmount = useMemo(() => {
    if (!amount) return 0n;
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return 0n;
    return BigInt(Math.floor(n * 1e6));
  }, [amount]);

  const token = useAToken ? AUSDC : USDC;
  const approval = useApproval(token, depositAmount);

  const doDeposit = () => {
    if (depositAmount === 0n) return;
    writeContract({
      address: POOL, abi: poolWriteAbi,
      functionName: useAToken ? "depositAToken" : "deposit",
      args: [depositAmount],
    });
  };
  const doWithdraw = () => {
    if (withdrawShares === 0n) return;
    writeContract({
      address: POOL, abi: poolWriteAbi, functionName: "withdraw",
      args: [withdrawShares],
    });
  };
  const doLink = () => writeContract({
    address: POOL, abi: poolWriteAbi, functionName: "linkCredential", args: [],
  });
  const doSync = () => writeContract({
    address: POOL, abi: poolWriteAbi, functionName: "syncStratum", args: [1],
  });

  if (!isConnected) {
    return (
      <div className="wallet">
        <div className="wallet-label">WALLET</div>
        <button className="wallet-connect" disabled={isPending} onClick={() => connect({connector: injected})}>
          {isPending ? "Connecting…" : "Connect wallet"}
        </button>
        <p className="wallet-hint">MetaMask or a compatible browser extension. All actions are real transactions on Monad testnet.</p>
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
        <>
          <div className="wallet-pos">
            <div><span>shares held</span><b>{fmtUsdc(Number(sharesHeld ?? 0n))}</b></div>
            <div><span>deferred</span><b>{fmtUsdc(Number(deferred ?? 0n))}</b></div>
          </div>

          <div className="wallet-deposit">
            <div className="wallet-row">
              <input
                className="wallet-input" type="number" min="0" placeholder="amount"
                value={amount} onChange={(e) => setAmount(e.target.value)}
              />
              <button className="wallet-mini" onClick={() => setUseAToken(!useAToken)}>
                {useAToken ? "aUSDC" : "USDC"}
              </button>
            </div>
            {approval.needsApproval ? (
              <button className="wallet-tx" disabled={approval.approvePending}
                onClick={approval.approve}>
                {approval.approvePending ? "Confirm in wallet…" : `Approve ${useAToken ? "aUSDC" : "USDC"}`}
              </button>
            ) : (
              <button className="wallet-tx" disabled={txPending || depositAmount === 0n} onClick={doDeposit}>
                {txPending ? "Confirm in wallet…" : "Deposit"}
              </button>
            )}
          </div>

          <div className="wallet-deposit">
            <div className="wallet-row">
              <input
                className="wallet-input" type="number" min="0" placeholder="shares"
                value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)}
              />
            </div>
            {plan && withdrawShares > 0n && (
              <p className="wallet-plan">
                {BRANCH[plan.branch]}{plan.burnable > 0n && plan.deferred > 0n
                  ? ` — ${((Number(plan.burnable) / Number(withdrawShares)) * 100).toFixed(0)}% redeemable`
                  : ""}
                {" · "}{fmtUsdc(Number(plan.burnable))} settles now
                {plan.deferred > 0n && <> · {fmtUsdc(Number(plan.deferred))} deferred ({REASON[plan.reason]})</>}
              </p>
            )}
            <button className="wallet-tx" disabled={txPending || withdrawShares === 0n} onClick={doWithdraw}>
              {txPending ? "Confirm in wallet…" : "Withdraw"}
            </button>
          </div>

          <div className="wallet-actions">
            <button className="wallet-mini" onClick={doLink}>Link credential</button>
            <button className="wallet-mini" onClick={doSync}>Sync compliance state</button>
          </div>
        </>
      )}

      {txHash && (
        <a className="wallet-txlink" href={EXPLORER_TX(txHash)} target="_blank" rel="noreferrer">
          tx {short(txHash)} ↗
        </a>
      )}
      {txError && <p className="wallet-err">{txError.message.split("\n")[0].slice(0, 120)}</p>}
      <button className="wallet-mini ghost" onClick={() => disconnect()}>Disconnect</button>
    </div>
  );
}
