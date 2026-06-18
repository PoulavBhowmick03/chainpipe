"use client";

import Link from "next/link";
import dynamic from "next/dynamic";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

const links = [
  { href: "/", label: "Home" },
  { href: "/bazaar", label: "Bazaar" },
  { href: "/pipeline/create", label: "Create Pipeline" },
  { href: "/my/pipelines", label: "My Pipelines" },
  { href: "/my/stake", label: "My Stake" },
];

export function NavBar() {
  return (
    <header className="border-b border-white/10 bg-panel/60 backdrop-blur sticky top-0 z-10">
      <nav className="max-w-6xl mx-auto flex items-center gap-6 px-4 h-14">
        <Link href="/" className="font-bold text-accent text-lg">
          ChainPipe
        </Link>
        <div className="flex gap-4 text-sm text-white/80">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-white">
              {l.label}
            </Link>
          ))}
        </div>
        <div className="ml-auto">
          <WalletMultiButton />
        </div>
      </nav>
    </header>
  );
}
