# Deploying LedgerForge to Solana Devnet

This is the **build + devnet** runbook. Solana mainnet-beta is a separate, manual
step — do not deploy to mainnet from automation.

## 0. Prerequisites

- Rust + Solana CLI (Agave) `solana --version` (tested: 2.3.8)
- `cargo build-sbf --arch v3` (ships with the Solana toolchain)
- Anchor CLI (optional, for `anchor keys sync` / IDL)
- Node 20+ / npm

## 1. Build the programs

```bash
cd solana
cargo build-sbf --arch v3            # → target/deploy/{skill_registry,x402_escrow,bazaar_listings}.so
```

The committed `Cargo.lock` pins several transitive crates to pre-`edition2024` /
pre-rustc-1.85 versions so the build works on the platform-tools 1.84 toolchain — do
not delete it.

## 2. Program IDs / keypairs

`target/` (including the program keypairs) is gitignored, so a fresh clone generates
**new** program keypairs on first build — their pubkeys won't match the committed
`declare_id!` / `Anchor.toml` values. Re-sync them:

```bash
# Option A (Anchor CLI):
anchor keys sync          # rewrites declare_id! + Anchor.toml to match target/deploy/*.json
cargo build-sbf --arch v3           # rebuild so the embedded IDs match

# Option B (manual): print each keypair's pubkey and paste into declare_id!/Anchor.toml
solana address -k target/deploy/skill_registry-keypair.json
solana address -k target/deploy/x402_escrow-keypair.json
solana address -k target/deploy/bazaar_listings-keypair.json
```

## 3. Fund a devnet deployer

```bash
solana config set --url https://api.devnet.solana.com
solana-keygen new -o ~/.config/solana/id.json     # or reuse a devnet-only key
solana airdrop 2                                   # repeat if rate-limited
solana balance
```

## 4. Deploy

```bash
cd solana
solana program deploy target/deploy/skill_registry.so
solana program deploy target/deploy/x402_escrow.so
solana program deploy target/deploy/bazaar_listings.so
# (or `anchor deploy --provider.cluster devnet` if using the Anchor CLI)
```

## 5. Initialize each program

Call the `initialize` instruction on each program (one-time), e.g. from a script
using `@coral-xyz/anchor` or the facilitator's instruction builders:

- `skill_registry.initialize(facilitator)` — facilitator = operator pubkey
- `x402_escrow.initialize(operator, fee_bps=20)`
- `bazaar_listings.initialize(fee_mint, fee_amount, treasury)`

## 6. Configure the off-chain services

```bash
cp .env.example .env
```

Fill `.env` (gitignored — never commit):

| Var | Value |
|---|---|
| `SOLANA_RPC` | `https://api.devnet.solana.com` |
| `SOLANA_CLUSTER` | `devnet` |
| `SOLANA_OPERATOR_SECRET` | operator key — base58 or JSON byte array (id.json) |
| `ALLOWED_MINTS` | devnet USDC mint (comma-separated) |
| `SKILL_REGISTRY_PROGRAM` / `X402_ESCROW_PROGRAM` / `BAZAAR_LISTINGS_PROGRAM` | deployed IDs |

```bash
cd facilitator && npm install && npm run build && npm start
cd sdk && npm install && npm run build
```

## Payment flow on Solana (differs from EVM)

Solana has no ERC-20 `approve`/`transferFrom` pull. The consumer **deposits** into a
job-PDA-owned vault via `create_job` (consumer-signed, from the SDK/dashboard), then
the facilitator verifies the ed25519 proof and **releases** via `complete_job`.
The consumer also creates the vault token account (owned by the job PDA) before
`create_job` — see `x402_escrow` `CreateJob` constraints.

## Mainnet (later, manual)

`solana config set --url https://api.mainnet-beta.solana.com`, fund a **real** key,
re-deploy. Verify the USDC mint (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`) and
run an audit pass before handling real value. Out of scope for the automated flow.
