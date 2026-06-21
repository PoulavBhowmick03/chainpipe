# Changelog — @chainpipe/solana

## 0.2.0

Optimistic settlement, proof-of-delivery, and production-hardening release.

### Added
- **Optimistic settlement + dispute layer**: `submitCompletion`, `disputeNode`, `finalizeNode`,
  `resolveDispute`, `getSettlement` — settle a node behind a dispute window instead of instantly.
- **Proof-of-delivery**: `deliveryMessage` (canonical agent-signed message binding the signature
  to `sha256(output)` **and** `sha256(uri)`), `verifyDelivery` (fetch the content-addressed uri,
  recompute the hash, compare to the on-chain `result_hash`), `sha256Bytes`, `encodeUri`/`decodeUri`,
  `MAX_URI_LEN`, `DISPUTE_SLOTS`.
- `settlementPda` PDA helper for the companion `NodeSettlement` account.
- Hardening instructions surfaced via the regenerated IDLs: `setPaused`, `setDisputeWindow`,
  `setMaxSlashBps`, `proposeOperator`/`acceptOperator`, and the `migrate*` config migrations.
- `@noble/hashes` is now a direct dependency (cross-platform sha256).

### Changed
- `createPipeline` now passes the `pipelineConfig` account (required by the pause guard).
- IDLs regenerated for all three programs (dispute/proof/hardening surface).

### Notes
- Targets the ChainPipe **devnet** deployment; see `DEPLOYED.md` for program IDs.
- v1 dispute arbitration is operated by the facilitator authority; see `DECENTRALIZATION.md`.

## 0.1.0
- Initial SDK: pipeline / stake / reputation / discovery helpers + IDLs.
