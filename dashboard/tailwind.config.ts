import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg0: "#07090d",
        bg: "#0a0d12",
        panel: "#0e1217",
        raised: "#12161d",
        line: "#1b212b",
        line2: "#262d39",
        hi: "#e8ebf0",
        tx: "#aab2c0",
        dim: "#6b7689",
        faint: "#454e5e",
        green: "#14f195",
        blue: "#4d9fff",
        red: "#ff5b5b",
        amber: "#f5a623",
      },
      fontFamily: {
        sans: ["var(--font-geist)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SF Mono", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
