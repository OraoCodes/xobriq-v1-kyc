import type { Config } from "tailwindcss";

/**
 * The whole design system in one place. A calm paper-white workspace; the
 * four verdict colors are the ONLY saturated colors in the product — that
 * restraint is what gives them weight when they finally appear.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FAF8F3",
        surface: "#FFFFFF",
        ink: {
          DEFAULT: "#1A1815",
          soft: "#6B655C",
        },
        hairline: "#EAE6DD",
        allow: { DEFAULT: "#3D7A5C", tint: "#E3F0E8" },
        "step-up": { DEFAULT: "#B67D2E", tint: "#F9EAD2" },
        review: { DEFAULT: "#6D5BC4", tint: "#E7E3F6" },
        block: { DEFAULT: "#B24A44", tint: "#F7E2E0" },
      },
      fontFamily: {
        display: ["var(--font-display)"],
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "tick-in": {
          "0%": { opacity: "0", transform: "scale(0.85)" },
          "60%": { opacity: "1", transform: "scale(1.05)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "verdict-in": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.4s ease-out both",
        "tick-in": "tick-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        "verdict-in": "verdict-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) both",
      },
    },
  },
  plugins: [],
};

export default config;
