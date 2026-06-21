# BLOCKERS

## D6 — Devnet deploy of dispute+proof dag_escrow blocked on faucet rate limit (Phase 13/16)

**Date:** 2026-06-21

**What:** The dispute+proof `dag_escrow` binary grew from 390,800 → 517,184 bytes.
Upgrading it on devnet requires:
1. `solana program extend 3Fqv… 140000` — DONE (cost ~0.97 SOL; programdata now 530,800 bytes).
2. A staging buffer rent-exempt at the new size ≈ **3.60 SOL**, held transiently then
   reclaimed by the atomic upgrade.

**Blocker:** Deploy wallet `5cpc…` has **2.12 SOL** after the extend; the buffer needs 3.60.
`solana airdrop` is rate-limited on `api.devnet.solana.com`; alternate public RPCs require an
API key. ~1.5 SOL short.

**Diagnosis / resolution:** Purely an ops/funding gate, not a code issue. The full
dispute+proof + hardening logic is verified green on localnet via `anchor test` (43/43, and
Phase 15 adds more). Resolution options, in order of preference:
1. Top up `5cpc…` to ≥4 SOL (web faucet faucet.solana.com w/ GitHub auth, or a funded
   transfer), then run the **single batched deploy session** for Phase 13 (dag_escrow) AND
   Phase 16 (all 3 programs + migrations) at once — more efficient than two sessions.
2. The loop retries `solana airdrop` across cycles in case the rate limit resets.

**Impact:** Phase 13/16 **code** is complete and committed; only the live devnet upgrade +
on-chain `migrate_*` + live e2e are deferred to the funded deploy session. Localnet
`anchor test` covers the on-chain behavior in the meantime.
