// Minimal Solana indexer for the LedgerForge Bazaar. Fetches + decodes the Skill PDAs
// (skill_registry) and Listing PDAs (bazaar_listings) via getProgramAccounts, filtering
// by Anchor account discriminator. Prints JSON. Run from solana/: node scripts/indexer.mjs
import { Connection, PublicKey } from "@solana/web3.js";
import { createHash } from "node:crypto";

const RPC = process.env.SOLANA_RPC ?? "https://api.devnet.solana.com";
const conn = new Connection(RPC, "confirmed");
const SKILL_REGISTRY = new PublicKey("26Xf7wEPJbG6EJ5kfAXbkot75ekSWdvpJH2rws1DEaEF");
const BAZAAR = new PublicKey("HnnH4asvgvAqyBnZKD6SVPMHEwTPTEBq2ZYU995j4Jt3");

// Anchor account discriminator = sha256("account:<Name>")[0..8]
const acctDisc = (name) => createHash("sha256").update(`account:${name}`).digest().subarray(0, 8);

function reader(buf) {
  let o = 8; // skip discriminator
  return {
    u8: () => buf.readUInt8(o++),
    bool: () => buf.readUInt8(o++) === 1,
    u64: () => { const v = buf.readBigUInt64LE(o); o += 8; return v.toString(); },
    pubkey: () => { const p = new PublicKey(buf.subarray(o, o + 32)).toBase58(); o += 32; return p; },
    str: () => { const len = buf.readUInt32LE(o); o += 4; const s = buf.subarray(o, o + len).toString("utf8"); o += len; return s; },
  };
}

async function fetchByDisc(programId, name) {
  return conn.getProgramAccounts(programId, {
    filters: [{ memcmp: { offset: 0, bytes: bs58Encode(acctDisc(name)) } }],
  });
}

// tiny base58 (avoid extra dep) — Solana uses btc alphabet
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function bs58Encode(buf) {
  let x = BigInt("0x" + Buffer.from(buf).toString("hex"));
  let out = "";
  while (x > 0n) { const m = Number(x % 58n); out = ALPHABET[m] + out; x /= 58n; }
  for (const b of buf) { if (b === 0) out = "1" + out; else break; }
  return out;
}

(async () => {
  const skillAccts = await fetchByDisc(SKILL_REGISTRY, "Skill");
  const skills = skillAccts.map(({ account }) => {
    const r = reader(account.data);
    return {
      skillId: r.u64(), provider: r.pubkey(), paymentMint: r.pubkey(),
      pricePerCall: r.u64(), totalJobs: r.u64(), score: r.u64(),
      active: r.bool(), endpoint: r.str(),
    };
  });

  const listingAccts = await fetchByDisc(BAZAAR, "Listing");
  const listings = listingAccts.map(({ account }) => {
    const r = reader(account.data);
    return {
      skillId: r.u64(), owner: r.pubkey(), tier: r.u8(), feePaid: r.bool(),
      name: r.str(), description: r.str(),
    };
  });

  console.log(JSON.stringify({ cluster: "devnet", skills, listings }, null, 2));
})().catch((e) => { console.error("indexer error:", e.message); process.exit(1); });
