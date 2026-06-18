import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import type { Stats } from "./decoder";

export interface StoreData {
  pipelines: any[];
  agents: any[];
  stats: Stats | null;
  updatedAt: number;
}

const EMPTY: StoreData = { pipelines: [], agents: [], stats: null, updatedAt: 0 };

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
    this.data = { pipelines, agents, stats, updatedAt };
    this.save();
  }
}
