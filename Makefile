# ChainPipe — dev orchestration
# `make run` starts the indexer (:3002), facilitator (:3001) and dashboard (:3000) together.

SHELL := /bin/bash
ANCHOR := PATH="$$HOME/.avm/bin:$$PATH" anchor

# Optional: point services + UI at a specific stake/payment mint (e.g. the seeded mint).
MINT ?=
ifneq ($(MINT),)
export CHAINPIPE_USDC_MINT := $(MINT)
export NEXT_PUBLIC_USDC_MINT := $(MINT)
endif

.DEFAULT_GOAL := help
.PHONY: help install build build-programs build-sdk build-services test \
        run server ui indexer facilitator dashboard e2e seed deploy init clean

help: ## Show this help
	@echo "ChainPipe — make targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "  Run with a seeded mint: make run MINT=<mint-pubkey>"

install: ## Install all workspace dependencies
	npm install

build-programs: ## Build the three Anchor programs (SBPFv3)
	cargo build-sbf --arch v3 --manifest-path programs/reputation_bridge/Cargo.toml
	cargo build-sbf --arch v3 --manifest-path programs/bonded_registry/Cargo.toml
	cargo build-sbf --arch v3 --manifest-path programs/dag_escrow/Cargo.toml

build-sdk: ## Build the @chainpipe/solana SDK
	npm --workspace @chainpipe/solana run build

build-services: build-sdk ## Build facilitator + indexer
	npm --workspace @chainpipe/facilitator run build
	npm --workspace @chainpipe/indexer run build

build: build-sdk build-services ## Build SDK, services and dashboard
	npm --workspace @chainpipe/dashboard run build

test: ## Run the Anchor program test suite (37 tests)
	$(ANCHOR) test

## --- run targets -----------------------------------------------------------

run: build-sdk ## Run indexer + facilitator + dashboard together (Ctrl-C stops all)
	@echo "Starting ChainPipe: indexer :3002 · facilitator :3001 · dashboard :3000"
	@trap 'kill 0' EXIT INT TERM; \
	  ( cd indexer && npm run dev ) & \
	  ( cd facilitator && npm run dev ) & \
	  ( cd dashboard && npm run dev ) & \
	  wait

server: build-sdk ## Run backend only (indexer + facilitator)
	@trap 'kill 0' EXIT INT TERM; \
	  ( cd indexer && npm run dev ) & \
	  ( cd facilitator && npm run dev ) & \
	  wait

ui: ## Run the dashboard (Next.js dev server) only
	cd dashboard && npm run dev

indexer: build-sdk ## Run the indexer only (:3002)
	cd indexer && npm run dev

facilitator: build-sdk ## Run the facilitator only (:3001)
	cd facilitator && npm run dev

dashboard: ## Run the dashboard only (:3000)
	cd dashboard && npm run dev

## --- on-chain scripts ------------------------------------------------------

deploy: build-programs ## Deploy all three programs to devnet
	solana program deploy target/deploy/reputation_bridge.so --program-id keys/reputation_bridge.json --url devnet
	solana program deploy target/deploy/bonded_registry.so   --program-id keys/bonded_registry.json   --url devnet
	solana program deploy target/deploy/dag_escrow.so        --program-id keys/dag_escrow.json        --url devnet

init: ## Initialize program configs on devnet
	npx tsx scripts/initialize-programs.mts

e2e: ## Run the full end-to-end lifecycle on devnet
	npx tsx scripts/e2e-devnet.mts

seed: ## Seed demo state (5 agents, 3 pipelines) on devnet
	npx tsx scripts/seed-devnet.mts

clean: ## Remove build artifacts and indexer data
	rm -rf sdk/dist facilitator/dist indexer/dist dashboard/.next indexer/data
