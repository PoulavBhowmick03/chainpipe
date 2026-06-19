import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { NavBar } from "@/components/NavBar";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", weight: ["400", "500", "600", "700"] });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "ChainPipe — Lock one budget for the whole pipeline",
  description:
    "ChainPipe escrows a single USDC budget across a DAG of agents. Each node settles as its dependencies clear — miss a deadline and the refund cascades downstream, atomically, on-chain.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body className="font-sans bg-bg0 text-hi">
        <Providers>
          <NavBar />
          <div className="max-w-[1260px] mx-auto px-[22px]">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
