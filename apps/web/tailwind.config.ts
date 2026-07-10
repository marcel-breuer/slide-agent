import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}", "../../packages/presentation-renderer/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#111827",
        muted: "#4b5563",
        line: "#e5e7eb",
        canvas: "#f9fafb",
        primary: "#a855f7",
        "primary-strong": "#9333ea",
        accent: "#10b981",
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
