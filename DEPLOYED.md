# Deployed Contracts — ChainPipe (Solana Devnet)

All three programs are deployed (SBPFv3) and initialized on Solana devnet.
Operator / upgrade authority: `5cpcXjLZHhntiqhNNX1Yay7SghhcALsQcwH2WJCs3VUm`

## Program IDs

| Program | Address | Explorer |
|---------|---------|----------|
| reputation_bridge | `6RRfs1Ho1bJ3JWXSy3xVth4BTGHWwVwum74ph2LRWWsf` | https://explorer.solana.com/address/6RRfs1Ho1bJ3JWXSy3xVth4BTGHWwVwum74ph2LRWWsf?cluster=devnet |
| bonded_registry | `26AB6S5crQAkhfx928bnWSHfpQE6wp2Sdt4afFtk7crq` | https://explorer.solana.com/address/26AB6S5crQAkhfx928bnWSHfpQE6wp2Sdt4afFtk7crq?cluster=devnet |
| dag_escrow | `3FqvkzppD4ciwkGLrcNoTHUCeHwNbWtot18CkrBdXiJd` | https://explorer.solana.com/address/3FqvkzppD4ciwkGLrcNoTHUCeHwNbWtot18CkrBdXiJd?cluster=devnet |

### Deploy transactions

| Program | Deploy Tx |
|---------|-----------|
| reputation_bridge | `5iq13bN68mVAFKrjAPuG7ybr2LYDfjXiHHHhc6E7pcSFyx6zQsniJQyed6bUDNNkSJgKebd8HPmUJ4bJiuNsGoVR` |
| bonded_registry | `2aWwQrJWqCEgDV7WHXPnUmY8q8Fke83iwnipcNYh8YaxQxFXQHNmrmNRV8ddsaeg9QeBW8zVdMiMTXrA4449VsJn` |
| dag_escrow | `25rUTatQDmCCgnFxPkGDbat1bX1g2NesyfAKB478kbS4ErRiVD6H667KhgVWhR1YdhjqZwZ21Y6iMEJyexkFMdpy` |

## Config PDAs

| Account | Address | Init / Set Tx |
|---------|---------|---------------|
| BridgeConfig | `GAhHPVYDeZh7QiPeHRGmfih8dL8DK6AW3EvPtNRe1Gjr` | init `zTuKRYXhoYKAiL7xWzaKcLGWaKbnmbgEW9cSLMmrTdTBWatxcEcE6nqr4S1WhDRFQRv3NbYYSFSgXLV4AtFsRQU` |
| RegistryConfig | `3FiQzfYX8bPzv6NwJp2irZSZZMDQxDZ23eiMgNe5PkvD` | init `5ed53WEkvYzBNDXX8UqXXC6foZYhAZTbbg6DgDvziHDtdGkLRRYdj8Q7wfpLc3Pm4cWFgNoT5GSeiCBdG2R8ghr9` |
| PipelineConfig | `3gfRFu4qv53K6S5DoMmoESPaX6QhtJZWDyDMgWGsaff6` | init `kKmmQKFX5arqffBghnYBTqfyEUZTZBtoUsqUsaaRKPxNs4dEvZvfsgXqrtBH56ry4MqaAMTVEktFLkGdXyFJT2Y` |

## Cross-program authority

| Name | Address |
|------|---------|
| dag_authority PDA (`[b"dag_authority"]` under dag_escrow) | `87QqAAJt4YnbfrYisGpBTjBbEu9ALXgEtrpPsLa8VWiW` |
| Facilitator authority | `DoNfxifuH9uBNBUvdDo4B1gQQzaGHzB83CTgA1DiCxUq` |

`bonded_registry.dag_escrow_authority` and `reputation_bridge.dag_escrow_authority`
are both set to the dag_authority PDA, so only `dag_escrow` (via signed CPI) can
slash stake, mutate open-job counters, or write reputation.

## Settings

- Fee BPS: 20 (0.20%)
- Slash BPS: 1500 (15%)
- Cooldown Slots: 60480 (~7 days)
- EMA Alpha BPS: 2000 (α = 0.20)
- Tier 1 minimum: 10_000_000 (10 USDC, 6 decimals)
- Tier 2 minimum: 100_000_000 (100 USDC)
- Tier 3 minimum: 1_000_000_000 (1000 USDC)

## Seeded demo state (`scripts/seed-devnet.mts`)

Test mint: `8BPRrfsXT3FZUvxW5v5ctq8Q5moZinNu7eFR4gtFPxz1`
(point the indexer/dashboard at it via `CHAINPIPE_USDC_MINT` / `NEXT_PUBLIC_USDC_MINT`).

| Agent | Skill | Tier | Address |
|-------|-------|------|---------|
| 0 | code-gen | 1 | `8EwfKQ3G4tPUqHNXHLrQrJDbNZrXULZe6NPhnWpBEp7D` |
| 1 | data-fetch | 2 | `6ie5sKfhhGJtahrGduKt1gzGhQb8n53tcDgPA4T3hYBj` |
| 2 | report-synthesis | 3 | `5wgZQQYGzAYqYeQUGWW4Ygi47i5EC1m9N8wp6JfDGRME` |
| 3 | api-proxy | 2 | `7D6umQf7GVf8rzHurGqWbZDqkN7753WeQEHcwJ4c5DXc` |
| 4 | nlp-summarization | 1 | `8tpxtAtQs3AwN9WbH2xz5QbVGF6RqkBKMtMABPbZNZjS` |

| Pipeline | Status | Address |
|----------|--------|---------|
| 1 | Completed | `6H8xWmGz7Gr7QZrERWktWQXFoVpR5X2gLqZL2ZR16uSs` |
| 2 | Active | `4pFdQSBSkhBR8Sjw5XNLDwsMxsmSuAAFx5s9Ezmd7vZa` |
| 3 | PartiallyRefunded | `7LqDXqWtpW4RTvyhJ9x5spWzxHfuLLmmp6Ld4g7zaKiu` |

## Reproduce

```bash
# Build (programs that are CPI dependencies must be built standalone — see BLOCKERS.md D2)
cargo build-sbf --arch v3 --manifest-path programs/reputation_bridge/Cargo.toml
cargo build-sbf --arch v3 --manifest-path programs/bonded_registry/Cargo.toml
cargo build-sbf --arch v3 --manifest-path programs/dag_escrow/Cargo.toml

# Deploy
solana program deploy target/deploy/<prog>.so --program-id keys/<prog>.json --url devnet

# Initialize configs + wire authorities
npx tsx scripts/initialize-programs.mts
```
