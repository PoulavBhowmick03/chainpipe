import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b0e14",
        panel: "#11151f",
        accent: "#14f195", // Solana green
        accent2: "#9945ff", // Solana purple
      },
    },
  },
  plugins: [],
};

export default config;
