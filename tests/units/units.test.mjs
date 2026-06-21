// Lightweight unit tests for the off-chain packages (run after they're built).
// Run: npm run test:units   (node --test)
import { test } from "node:test";
import assert from "node:assert/strict";
import { PublicKey } from "@solana/web3.js";

import { sha256 } from "@noble/hashes/sha256";
import {
  DEVNET_ADDRESSES, pipelinePda, agentStakePda, dagAuthorityPda,
  deliveryMessage, verifyDelivery, encodeUri, decodeUri,
} from "../../sdk/dist/index.js";
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

test("encodeUri / decodeUri round-trip into the 96-byte buffer", () => {
  const uri = "ipfs://bafkreigooddeliveryproof";
  const { bytes, len } = encodeUri(uri);
  assert.equal(bytes.length, 96);
  assert.equal(len, Buffer.from(uri, "utf8").length);
  assert.equal(decodeUri(bytes, len), uri);
  assert.throws(() => encodeUri("x".repeat(97)));
});

test("deliveryMessage layout is 32+1+32+32+32 and binds uri via sha256", () => {
  const pipeline = new PublicKey("5cpcXjLZHhntiqhNNX1Yay7SghhcALsQcwH2WJCs3VUm");
  const jobId = new Uint8Array(32).fill(1);
  const resultHash = new Uint8Array(32).fill(2);
  const uriBytes = new TextEncoder().encode("ipfs://cid");
  const msg = deliveryMessage(pipeline, 3, jobId, resultHash, uriBytes);
  assert.equal(msg.length, 32 + 1 + 32 + 32 + 32);
  assert.equal(msg[32], 3); // node index byte
  // last 32 bytes are sha256(uriBytes) — binding the retrieval pointer
  assert.deepEqual(Array.from(msg.slice(-32)), Array.from(sha256(uriBytes)));
  // changing the uri changes the signed message (no signature replay across deliveries)
  const other = deliveryMessage(pipeline, 3, jobId, resultHash, new TextEncoder().encode("ipfs://other"));
  assert.notDeepEqual(Array.from(msg.slice(-32)), Array.from(other.slice(-32)));
});

test("verifyDelivery: ok on hash match, fail on mutated byte", async () => {
  const payload = new Uint8Array([10, 20, 30, 40, 50]);
  const goodHash = sha256(payload);
  const uriBuf = encodeUri("https://example.test/output.bin");
  const stubFetch = async () => ({ ok: true, arrayBuffer: async () => payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength) });

  const okCheck = await verifyDelivery(
    { uri: uriBuf.bytes, uriLen: uriBuf.len, resultHash: Array.from(goodHash) },
    { fetchImpl: stubFetch }
  );
  assert.equal(okCheck.ok, true);
  assert.equal(okCheck.actualHash, Buffer.from(goodHash).toString("hex"));

  const badHash = new Uint8Array(32).fill(7);
  const badCheck = await verifyDelivery(
    { uri: uriBuf.bytes, uriLen: uriBuf.len, resultHash: Array.from(badHash) },
    { fetchImpl: stubFetch }
  );
  assert.equal(badCheck.ok, false);
});
