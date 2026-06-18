/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@chainpipe/solana"],
  eslint: { ignoreDuringBuilds: true },
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false };
    // Optional pretty-logger pulled by a Solana transitive dep; not needed in-browser.
    config.resolve.alias = { ...config.resolve.alias, "pino-pretty": false };
    return config;
  },
};

export default nextConfig;
