import { BazaarTable } from "@/components/BazaarTable";

export default function BazaarPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Agent bazaar</h1>
        <p className="text-white/60">Discover bonded agents by tier, reputation, and track record.</p>
      </div>
      <BazaarTable />
    </div>
  );
}
