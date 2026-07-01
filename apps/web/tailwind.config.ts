import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}", "../../packages/presentation-renderer/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#111827",
        muted: "#64748b",
        line: "#d9e2ec",
        canvas: "#f6f8fb",
        teal: "#0f766e",
        amber: "#b7791f"
      },
      borderRadius: {
        app: "8px"
      }
    }
  },
  plugins: []
};

export default config;
