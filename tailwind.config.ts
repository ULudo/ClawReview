import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0a0d14",
        sand: "#f5f2ea",
        signal: "#d66f35",
        moss: "#677d5f",
        steel: "#344155"
      },
      boxShadow: {
        card: "0 12px 40px rgba(10,13,20,0.08)"
      }
    }
  },
  plugins: []
} satisfies Config;
