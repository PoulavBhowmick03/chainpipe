# Migration: Mantle (EVM) → Solana

This repo is a fork of LedgerForge (Mantle build, `ledgerforge@34117fe`) ported to
**Solana devnet**. The original Mantle repo is untouched. Unlike the Celo port (a
config-level EVM→EVM change), Solana is a **ground-up rewrite** — no EVM, no Solidity,
no EIP-712.

## Architecture mapping

| Concept | Mantle (EVM) | Solana |
|---|---|---|
| Contracts | Solidity (Foundry) | Anchor programs (Rust), SBF |
| Storage | `mapping(id => struct)` | one PDA account per entity |
| Tokens | ERC-20 (USDe/USDC) | SPL token (devnet USDC) |
| Escrow funding | `approve` + `transferFrom` (operator pull) | consumer `create_job` deposit into job-PDA vault |
| Auth | `Ownable` / allowlist | `has_one` / `constraint` on PDA authorities |
| Payment proof | EIP-712 `signTypedData` | ed25519 `sign.detached` over a canonical message |
| Explorer | mantlescan.xyz | explorer.solana.com |

## Done ✅

- **Programs** (`solana/programs/`): `skill_registry`, `x402_escrow`, `bazaar_listings`
  — full instruction logic (register/update/record-job/pause; SPL deposit → PDA-signed
  payout+fee release → refund; listing + fee→treasury). **`cargo build-sbf` compiles
  all 3 to `.so`.** `Cargo.lock` pins transitive crates to keep the platform-tools 1.84
  toolchain building (edition2024 / rustc-1.85 avoidance); `anchor-spl` trimmed to
  `features=["token"]` to prune the token-2022/zk subtree.
- **SDK** (`@ishitaaaaw/x402-mantle` → `x402-solana`): `@solana/web3.js`, ed25519
  signing (tweetnacl) over `canonicalPaymentMessage`, `invokeSkill` flow. **`tsc` green.**
- **Facilitator**: `Connection` + operator `Keypair`; ed25519 verify (byte-identical
  canonical message to the SDK); settler builds Anchor `complete_job` +
  `record_job_completion` (+ `/register` → `register_skill`) instructions via manual
  discriminator + borsh + PDA wiring; `decodeJob` reads the vault/provider. **`tsc` green.**
- **Dashboard**: Solana wallet-adapter scaffold added (`dashboard/src/solana/`:
  `config.ts`, `WalletProvider.tsx`) + deps. (See remaining.)
- **Docs**: `DEPLOY.md` (devnet runbook), README reframed for Solana + Superteam.

## Remaining ⏳

- **Dashboard full UI port (largest item).** The existing components are still EVM/viem
  (`WalletContext`, `PaymentModal`, `useBrowserWalletClient`, `PreflightBanner`,
  agent-demo). Wire `SolanaWalletProvider` into `app/layout.tsx`, replace MetaMask/viem
  with `useWallet()`/`useConnection()`, and swap EIP-712 `signTypedData` for
  `signMessage` over `canonicalPaymentMessage`. `viem` stays in deps until this is done.
- **Consumer deposit flow.** Add a `create_job` helper (SDK + dashboard) so the consumer
  creates the vault token account (owned by the job PDA) and deposits before the
  facilitator's `complete_job`. The facilitator side is implemented.
- **Indexer.** Still EVM/viem; needs a Solana rewrite (poll program accounts / parse
  logs) to feed the Bazaar. Not yet started.
- **Devnet deploy + end-to-end test.** Gated on a funded devnet key — see `DEPLOY.md`.
  Then backfill deployed program IDs and replace README "pending" notes with explorer links.
- **`anchor test` on localnet.** Add TS integration tests under `solana/tests/`.
- **`token::transfer` → `transfer_checked`** in the programs (deprecation; correctness).
- **ERC-8004.** No equivalent on Solana; reputation is local-only on the `Skill` PDA.
