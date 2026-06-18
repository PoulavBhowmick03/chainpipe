const COLORS: Record<string, string> = {
  pending: "border-white/30 text-white/60",
  claimed: "border-blue-400/60 text-blue-300",
  settled: "border-accent/60 text-accent",
  expired: "border-red-400/60 text-red-300",
};

export function NodeStatusBadge({ status }: { status: string }) {
  const cls = COLORS[status] ?? "border-white/20 text-white/50";
  return <span className={`badge ${cls} capitalize`}>{status}</span>;
}
