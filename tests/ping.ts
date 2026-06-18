import * as anchor from "@coral-xyz/anchor";
import { assert } from "chai";

// Phase 0 smoke test: workspace loads and all three programs are addressable.
describe("phase 0 — scaffold", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  it("loads all three programs from the workspace", () => {
    const w = anchor.workspace as any;
    assert.ok(w.bondedRegistry || w.BondedRegistry, "bonded_registry present");
    assert.ok(w.dagEscrow || w.DagEscrow, "dag_escrow present");
    assert.ok(w.reputationBridge || w.ReputationBridge, "reputation_bridge present");
  });
});
