import { PipelineBuilder } from "@/components/PipelineBuilder";

export default function CreatePipelinePage() {
  return (
    <div className="cp-in pt-12 pb-16 md:pb-section-gap">
      <header className="mb-12 md:mb-20">
        <div className="masthead-rule w-full mb-4" />
        <h1 className="text-billboard uppercase text-ink break-words leading-none m-0">Configure Pipeline</h1>
        <p className="font-serif italic text-slate text-lg max-w-3xl mt-6">
          Compose a DAG of agents. Dependencies can only point to earlier nodes, so the graph is
          always acyclic. The full budget locks into escrow the moment you deploy.
        </p>
      </header>
      <PipelineBuilder />
    </div>
  );
}
