import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import type { Stats } from "./decoder";

export interface NodeSpec {
  skill: string;
  description: string;
  inputUri: string;
}
/** Off-chain, consumer-signed job specs: pipeline → { consumer, nodes: {nodeIndex: spec} }.
 *  Kept here (durable volume) and merged into /pipelines on read; binding to the real
 *  on-chain consumer is checked at read time. The chain carries money + trust; this
 *  carries "what to build". */
export type SpecStore = Record<string, { consumer: string; nodes: Record<number, NodeSpec> }>;

export interface StoreData {
  pipelines: any[];
  agents: any[];
  stats: Stats | null;
  specs: SpecStore;
  updatedAt: number;
}

const EMPTY: StoreData = { pipelines: [], agents: [], stats: null, specs: {}, updatedAt: 0 };

/** In-memory store with JSON-file persistence across restarts. */
export class Store {
  data: StoreData = EMPTY;

  constructor(private file: string) {
    this.load();
  }

  private load() {
    try {
      if (existsSync(this.file)) {
        this.data = JSON.parse(readFileSync(this.file, "utf-8"));
        if (!this.data.specs) this.data.specs = {};
      }
    } catch {
      this.data = { ...EMPTY };
    }
  }

  save() {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }

  update(pipelines: any[], agents: any[], stats: Stats, updatedAt: number) {
    // Preserve specs across polls (poll data only refreshes chain-derived state).
    this.data = { pipelines, agents, stats, specs: this.data.specs ?? {}, updatedAt };
    this.save();
  }

  setSpecs(pipeline: string, consumer: string, nodes: Record<number, NodeSpec>) {
    if (!this.data.specs) this.data.specs = {};
    this.data.specs[pipeline] = { consumer, nodes };
    this.save();
  }
}
