// Lightweight unit tests for the off-chain packages (run after they're built).
// Run: npm run test:units   (node --test)
import { test } from "node:test";
import assert from "node:assert/strict";
import { PublicKey } from "@solana/web3.js";

import { DEVNET_ADDRESSES, pipelinePda, agentStakePda, dagAuthorityPda } from "../../sdk/dist/index.js";
import { scoreDelta } from "../../facilitator/dist/scorer.js";
import { computeStats, serialize } from "../../indexer/dist/decoder.js";

test("SDK PDAs are deterministic", () => {
  const owner = new PublicKey("5cpcXjLZHhntiqhNNX1Yay7SghhcALsQcwH2WJCs3VUm");
  const a = pipelinePda(DEVNET_ADDRESSES, owner, 1n);
  const b = pipelinePda(DEVNET_ADDRESSES, owner, 1n);
  assert.equal(a.toBase58(), b.toBase58());
  assert.notEqual(
    pipelinePda(DEVNET_ADDRESSES, owner, 1n).toBase58(),
    pipelinePda(DEVNET_ADDRESSES, owner, 2n).toBase58()
  );
  assert.ok(agentStakePda(DEVNET_ADDRESSES, owner) instanceof PublicKey);
  assert.ok(dagAuthorityPda(DEVNET_ADDRESSES) instanceof PublicKey);
});

test("facilitator scoreDelta is bounded [200, 1000]", () => {
  assert.equal(scoreDelta(0, 0), 200); // no headroom
  assert.equal(scoreDelta(0, 1_000_000), 1000); // full headroom (clamped)
  const mid = scoreDelta(0, 1500);
  assert.ok(mid >= 200 && mid <= 1000);
});

test("indexer computeStats handles empty input", () => {
  const s = computeStats([], []);
  assert.equal(s.totalPipelines, 0);
  assert.equal(s.totalAgentsStaked, 0);
  assert.equal(s.totalUsdcSettled, "0");
});

test("indexer serialize converts PublicKey + bigint", () => {
  const pk = new PublicKey("5cpcXjLZHhntiqhNNX1Yay7SghhcALsQcwH2WJCs3VUm");
  const out = serialize({ owner: pk, n: 5n, nested: [pk] });
  assert.equal(out.owner, pk.toBase58());
  assert.equal(out.n, "5");
  assert.equal(out.nested[0], pk.toBase58());
});
