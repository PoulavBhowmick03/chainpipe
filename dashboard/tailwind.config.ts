import type { Config } from "tailwindcss";

// ── Settlement Broadsheet design tokens ──────────────────────────────────────
// "Paper & Ink" publication-terminal palette. Oxblood is the only chromatic accent,
// reserved for primary actions and high-stakes alerts. Everything else is paper, ink,
// and warm-gray metadata, separated by 1px mist hairlines (never shadows).
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // paper scale
        linen: "#F4F1EA", // page base
        paper: "#FBF9F4", // surface lift on linen
        "paper-bright": "#FFFFFF",
        "paper-dim": "#ECE8DE", // table headers / chip insets
        // ink + metadata
        ink: "#161512", // obsidian-ink, primary text
        bark: "#26241E",
        slate: "#6A655B", // secondary metadata
        "slate-dim": "#9C968A", // faintest text / ticks
        mist: "#D8D3C7", // hairline
        "mist-2": "#C4BDAD", // stronger hairline
        // the single accent
        oxblood: "#6B1F23",
        "oxblood-deep": "#4D1518",
        // legacy aliases kept so existing className references don't break
        bg0: "#F4F1EA",
        bg: "#ECE8DE",
        panel: "#FBF9F4",
        raised: "#FFFFFF",
        line: "#D8D3C7",
        line2: "#C4BDAD",
        hi: "#161512",
        tx: "#3A352D",
        dim: "#6A655B",
        faint: "#9C968A",
        green: "#6B1F23",
        blue: "#1F5A4C",
        red: "#BA1A1A",
        amber: "#9A6A2E",
      },
      fontFamily: {
        // --font-geist is now Source Serif 4 (editorial), --font-geist-mono is JetBrains Mono
        sans: ["var(--font-geist)", "Source Serif 4", "Georgia", "serif"],
        serif: ["var(--font-geist)", "Source Serif 4", "Georgia", "serif"],
        mono: ["var(--font-geist-mono)", "JetBrains Mono", "ui-monospace", "monospace"],
      },
      spacing: {
        gutter: "24px",
        "margin-desktop": "64px",
        "margin-mobile": "16px",
        "section-gap": "100px",
      },
      borderWidth: {
        3: "3px",
      },
    },
  },
  plugins: [],
};

export default config;
