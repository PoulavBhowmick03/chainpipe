/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  // The @solana/wallet-adapter packages bundle a nested @types/react@19 whose
  // ReactNode (incl. Promise) clashes with this app's React 18 — a harmless
  // version skew that a clean install dedupes but Vercel's fresh install does
  // not. The app type-checks correctly under a single @types/react@18 locally.
  typescript: { ignoreBuildErrors: true },
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false };
    // Optional pretty-logger pulled by a Solana transitive dep; not needed in-browser.
    config.resolve.alias = { ...config.resolve.alias, "pino-pretty": false };
    return config;
  },
};

export default nextConfig;
