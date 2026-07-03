import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}", "../../packages/presentation-renderer/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f172a",
        muted: "#64748b",
        line: "#e2e8f0",
        canvas: "#f8fafc",
        primary: "#9333ea",
        "primary-strong": "#7e22ce",
        accent: "#7c3aed",
        warning: "#a16207",
      },
      borderRadius: {
        app: "8px",
      },
    },
  },
  plugins: [],
};

export default config;
