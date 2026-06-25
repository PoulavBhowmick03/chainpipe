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
        // ── DARK "Night Broadsheet" — warm near-black paper, cream ink, luminous oxblood ──
        // paper scale (now dark surfaces)
        linen: "#100C0C", // page base
        paper: "#17110F", // surface lift
        "paper-bright": "#211917",
        "paper-dim": "#1B1413", // table headers / chip insets
        // ink + metadata (now cream → warm gray)
        ink: "#F1ECE5", // primary text
        bark: "#C9C0B6",
        slate: "#ADA298", // secondary metadata
        "slate-dim": "#857C72", // faintest text / ticks
        mist: "#2C2421", // hairline
        "mist-2": "#3C322D", // stronger hairline
        // the single accent (luminous on dark)
        oxblood: "#CB5A60",
        "oxblood-deep": "#C24E54",
        // legacy aliases kept so existing className references don't break
        bg0: "#100C0C",
        bg: "#1B1413",
        panel: "#17110F",
        raised: "#211917",
        line: "#2C2421",
        line2: "#3C322D",
        hi: "#F1ECE5",
        tx: "#D8D0C6",
        dim: "#ADA298",
        faint: "#857C72",
        green: "#CB5A60",
        blue: "#5BA89A",
        red: "#E5574E",
        amber: "#D69A4E",
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
