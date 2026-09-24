import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#0f2a4a",
        ink: "#172033",
        muted: "#64748b",
        line: "#dbe4ef",
        canvas: "#f6f8fb",
        accent: "#1d5c96"
      },
      boxShadow: {
        soft: "0 12px 32px rgba(15, 42, 74, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
