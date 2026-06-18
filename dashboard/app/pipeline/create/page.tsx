import { PipelineBuilder } from "@/components/PipelineBuilder";

export default function CreatePipelinePage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Create a pipeline</h1>
        <p className="text-white/60">
          Define a DAG of jobs. The full budget locks into an escrow vault; nodes settle as
          dependencies complete, and expired nodes cascade refunds back to you.
        </p>
      </div>
      <PipelineBuilder />
    </div>
  );
}
