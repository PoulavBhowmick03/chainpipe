"use client";

import { useEffect, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { PROGRAM_IDS, SOLANA_RPC } from "./config";

export interface SolanaSkill {
  skillId: string;
  provider: string;
  paymentMint: string;
  pricePerCall: string;
  totalJobs: string;
  score: string;
  active: boolean;
  endpoint: string;
}

// Decodes a skill_registry `Skill` account (skips the smaller RegistryConfig PDA).
function decodeSkill(data: Buffer): SolanaSkill | null {
  if (data.length < 110) return null; // RegistryConfig is 82 bytes; Skill is larger
  let o = 8;
  const u64 = () => { const v = data.readBigUInt64LE(o); o += 8; return v.toString(); };
  const pk = () => { const p = new PublicKey(data.subarray(o, o + 32)).toBase58(); o += 32; return p; };
  const skillId = u64(), provider = pk(), paymentMint = pk(), pricePerCall = u64();
  const totalJobs = u64(), score = u64();
  const active = data.readUInt8(o++) === 1;
  const len = data.readUInt32LE(o); o += 4;
  const endpoint = data.subarray(o, o + len).toString("utf8");
  return { skillId, provider, paymentMint, pricePerCall, totalJobs, score, active, endpoint };
}

/** Reads live skills from the deployed skill_registry program on devnet. */
export function useSolanaSkills() {
  const [skills, setSkills] = useState<SolanaSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const conn = new Connection(SOLANA_RPC, "confirmed");
    conn
      .getProgramAccounts(PROGRAM_IDS.skillRegistry)
      .then((accts) => {
        if (cancelled) return;
        const out = accts
          .map(({ account }) => decodeSkill(Buffer.from(account.data)))
          .filter((s): s is SolanaSkill => s !== null);
        setSkills(out);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return { skills, loading, error };
}
