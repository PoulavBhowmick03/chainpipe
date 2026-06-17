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
