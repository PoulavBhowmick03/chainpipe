import type { Metadata } from "next";
import { Source_Serif_4, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { NavBar } from "@/components/NavBar";
import { Footer } from "@/components/Footer";

// Broadsheet type system: Source Serif 4 carries the editorial voice, JetBrains Mono
// every on-chain string (addresses, hashes, amounts). We keep the original CSS-variable
// names (--font-geist / --font-geist-mono) so the existing inline `var(--font-geist-mono)`
// references across components remap to the new fonts without a sweeping edit.
const serif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-geist",
  weight: ["300", "400", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ChainPipe — The authoritative registry of definitive settlement",
  description:
    "ChainPipe escrows a single USDC budget across a DAG of agents. Each node settles as its dependencies clear — miss a deadline and the refund cascades downstream, atomically, on-chain.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${mono.variable}`}>
      <body className="font-sans bg-linen text-ink min-h-screen flex flex-col">
        <Providers>
          <NavBar />
          <div className="flex-grow w-full max-w-[1440px] mx-auto px-4 md:px-16">{children}</div>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
