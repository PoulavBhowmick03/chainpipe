"use client";

import { useEffect, useState } from "react";
import { DagCanvas, type DagNode } from "@/components/DagCanvas";

// Base topology for the landing hero; statuses animate on a loop so the DAG reads
// as a live machine (value settling node-by-node), not a static diagram.
const BASE: Omit<DagNode, "status" | "statusShort" | "agentStr">[] = [
  { id: 0, label: "0", title: "data-fetch", allocStr: "30.00", tier: 2, deps: [] },
  { id: 1, label: "1", title: "code-gen", allocStr: "60.00", tier: 3, deps: [0] },
  { id: 2, label: "2", title: "report-synth", allocStr: "40.00", tier: 2, deps: [1] },
  { id: 3, label: "3", title: "image-gen", allocStr: "20.00", tier: 1, deps: [0] },
];
const AGENT: Record<number, string> = { 0: "Bz4k…gK2", 1: "Ag1z…QvB", 2: "Cd7m…Lp9", 3: "Ef3n…Rt4" };

// Frames: each maps node id → status. Loops to show value flowing through the pipeline.
const FRAMES: Record<number, string>[] = [
  { 0: "settled", 1: "claimed", 2: "pending", 3: "pending" },
  { 0: "settled", 1: "settled", 2: "claimed", 3: "claimed" },
  { 0: "settled", 1: "settled", 2: "settled", 3: "settled" },
  { 0: "settled", 1: "claimed", 2: "pending", 3: "claimed" },
];
const SHORT: Record<string, string> = { pending: "PENDING", claimed: "CLAIMED", settled: "SETTLED" };

export function HeroDag({ height = 300 }: { height?: number }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), 1900);
    return () => clearInterval(id);
  }, []);

  const f = FRAMES[frame];
  const nodes: DagNode[] = BASE.map((n) => {
    const status = f[n.id] ?? "pending";
    return { ...n, status, statusShort: SHORT[status], agentStr: status === "pending" ? "—" : AGENT[n.id] };
  });
  return <DagCanvas nodes={nodes} height={height} />;
}
