# LedgerForge — Solana devnet deployment

**Deployed & initialized on Solana devnet.** Build requires `cargo build-sbf --arch v3`
with Agave/solana-cli ≥ 4.0 (the default arch / older CLI emit an SBPF version devnet
rejects with "sbpf_version ... not enabled").

| Program | Program ID | Explorer (devnet) |
|---|---|---|
| `skill_registry` | `26Xf7wEPJbG6EJ5kfAXbkot75ekSWdvpJH2rws1DEaEF` | https://explorer.solana.com/address/26Xf7wEPJbG6EJ5kfAXbkot75ekSWdvpJH2rws1DEaEF?cluster=devnet |
| `x402_escrow` | `Ec48mwadrna8FC5rJ24K5R5fMVCBFBzhbbeFkf6skiYq` | https://explorer.solana.com/address/Ec48mwadrna8FC5rJ24K5R5fMVCBFBzhbbeFkf6skiYq?cluster=devnet |
| `bazaar_listings` | `HnnH4asvgvAqyBnZKD6SVPMHEwTPTEBq2ZYU995j4Jt3` | https://explorer.solana.com/address/HnnH4asvgvAqyBnZKD6SVPMHEwTPTEBq2ZYU995j4Jt3?cluster=devnet |

Config PDAs (initialized; authority/operator = `5cpcXjLZHhntiqhNNX1Yay7SghhcALsQcwH2WJCs3VUm`):

| Program | config PDA | size |
|---|---|---|
| `skill_registry` | `8p338mVtcWcBCZVyZDfeRtkzn6jsMR1sESLEqxjGJsfx` | 82 b |
| `x402_escrow` | `7eBXyzyyz3xHTpd4oT9XLtygxqAuDPHBRycfe4J9CGaV` | 75 b (fee 20 bps) |
| `bazaar_listings` | `LqV99VcWn3RFkd51TGgkueGf5ibtaYhkDTqZUisfLd2` | 113 b |

Build + deploy: `cd solana && cargo build-sbf --arch v3 && bash scripts/deploy-devnet.sh`
(idempotent — skips already-deployed programs, then runs `init-devnet.mjs`).

## Executed end-to-end flow (live devnet proof)

Full loop run via `facilitator/scripts/e2e-devnet.mjs` against the deployed programs
(fresh test SPL mint, 6 dp; amount 1.0 token; fee 20 bps):

| Step | Result | Tx (explorer.solana.com, devnet) |
|---|---|---|
| `register_skill` | skill #1781719935 registered | `646qkyi5UPTzvbnWBeMFzUJieHAvcYEbzQ6jzbYriqK5ZkyXddsycekmNxu6uit2DHay2iCLwT7nibLcYqDYecZb` |
| `create_job` | consumer deposited 1,000,000 into job-PDA vault | `2JkC4pdkiorpjxC7SEibkNhWNZP4j1ML1xDmQ6pNgbDviMBBe28tnBJvxQRKy97GVa3Cw1cVJFahFmifTE8R6dEd` |
| `complete_job` | provider received **998,000**, operator fee **2,000** (= 20 bps) | `vBpa3vghJt8XzNHx7nGXDfsiS2dPAKmKGc542z8vYhi9P1Gw9rFnMKXYjSXV5SxiWhpRA8WHikbDLC5GJtigaK2` |
| `record_job_completion` | reputation → **total_jobs=1, score=85** (facilitator-gated) | `4LriJunkAfFSNNKuk5BWngsZUzgcAJnPvojA9bFTuKWUbV2KErW5zM9prt2Ru9BBhVNUr4XZ2FLKcuj9UTXARXMs` |

Reproduce: `cd facilitator && node scripts/e2e-devnet.mjs` (uses the funded local
deployer as operator/facilitator; mints a throwaway SPL token for the demand side).
This proves the escrow deposit → PDA-signed payout+fee release → on-chain reputation
write all execute correctly on the live contracts.
