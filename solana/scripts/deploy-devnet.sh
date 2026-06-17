#!/usr/bin/env bash
# Deploys any not-yet-deployed LedgerForge programs to the current Solana cluster,
# then initializes them. Idempotent: skips programs already deployed. Assumes the
# deployer keypair is funded (see DEPLOY.md — devnet needs ~12 SOL total).
set -euo pipefail
cd "$(dirname "$0")/.."   # solana/

deploy_if_missing() {
  local name="$1" keypair="target/deploy/${1}-keypair.json" so="target/deploy/${1}.so"
  local pid; pid=$(solana address -k "$keypair")
  if solana program show "$pid" >/dev/null 2>&1; then
    echo "✓ $name already deployed: $pid"
  else
    echo "→ deploying $name ($pid) ..."
    solana program deploy --program-id "$keypair" "$so"
  fi
}

echo "deployer: $(solana address)  balance: $(solana balance)"
deploy_if_missing skill_registry
deploy_if_missing x402_escrow
deploy_if_missing bazaar_listings

echo "→ initializing config PDAs ..."
( cd ../facilitator && node scripts/init-devnet.mjs )
echo "✅ devnet deploy + init complete"
