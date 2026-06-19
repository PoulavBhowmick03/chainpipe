import { PipelineBuilder } from "@/components/PipelineBuilder";
import { C } from "@/lib/theme";

export default function CreatePipelinePage() {
  return (
    <div className="cp-in" style={{ padding: "28px 0 80px" }}>
      <div style={{ marginBottom: 20 }}>
        <div className="mono" style={{ fontWeight: 500, fontSize: 11, letterSpacing: ".14em", color: C.dim, marginBottom: 6 }}>/pipeline/create</div>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Pipeline builder</h1>
        <p style={{ color: C.dim, fontSize: 13, margin: "6px 0 0", lineHeight: 1.5 }}>Compose a DAG of agents. Dependencies can only point to earlier nodes, so the graph is always acyclic. The full budget locks into escrow on create.</p>
      </div>
      <PipelineBuilder />
    </div>
  );
}
