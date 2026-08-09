"use client";

import {useReadContract} from "wagmi";
import {POOL, AUSDC} from "@/lib/contracts";
import {POOL_ADDRESS} from "@/lib/strata";
import {APASS, POLICY} from "@/lib/contracts";

const APASS_ABI = [{type: "function", name: "balanceOf", stateMutability: "view", inputs: [{name: "a", type: "address"}], outputs: [{name: "", type: "uint256"}]}] as const;
const POLICY_ABI = [
  {type: "function", name: "isTokenRegistered", stateMutability: "view", inputs: [{name: "token", type: "address"}], outputs: [{name: "", type: "bool"}]},
  {type: "function", name: "isPaused", stateMutability: "view", inputs: [{name: "token", type: "address"}], outputs: [{name: "", type: "bool"}]},
] as const;

function Chip({label, ok, text}: {label: string; ok: boolean | null; text: string}) {
  const state = ok === null ? "pending" : ok ? "ok" : "bad";
  return (
    <div className={`wire-chip ${state}`}>
      <span className="chip-dot" />
      <h3>{label}</h3>
      <p>{ok === null ? "reading…" : text}</p>
    </div>
  );
}

export function LiveWiring() {
  const poolApass = useReadContract({address: APASS, abi: APASS_ABI, functionName: "balanceOf", args: [POOL_ADDRESS]}).data as bigint | undefined;
  const registered = useReadContract({address: POLICY, abi: POLICY_ABI, functionName: "isTokenRegistered", args: [AUSDC]}).data as boolean | undefined;
  const paused = useReadContract({address: POLICY, abi: POLICY_ABI, functionName: "isPaused", args: [AUSDC]}).data as boolean | undefined;

  return (
    <div className="wiring">
      <Chip label="CVI · A-PASS (pool)" ok={poolApass !== undefined && poolApass > 0n} text={`pool credential: balanceOf == ${poolApass === undefined ? "…" : poolApass.toString()}`} />
      <Chip label="POLICY — aUSDC registered" ok={registered === undefined ? null : registered} text={registered === undefined ? "…" : registered ? "isTokenRegistered(aUSDC) == true" : "NOT registered"} />
      <Chip label="POLICY — paused" ok={paused === undefined ? null : !paused} text={paused === undefined ? "…" : paused ? "isPaused == true" : "isPaused == false — live"} />
      <Chip label="POOL — owner" ok={true} text={`0x483C8C…9389 (team-held key)`} />
    </div>
  );
}
