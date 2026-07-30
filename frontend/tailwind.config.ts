import type { Config } from "tailwindcss";

/**
 * Design tokens for the Command Center console. Deliberately not a
 * templated SaaS-dashboard palette: dark slate base (not pure black),
 * muted status colors instead of alarm-red/traffic-light green, and a
 * mono/sans pairing where the mono face is reserved for anything that's
 * an opaque identifier in the API (device IDs, tokens, hashes, timestamps)
 * so the UI's typography itself signals "this value is copy-pasteable
 * data" vs "this is human-authored text."
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#0B0E14",
        surface: "#131826",
        "surface-raised": "#1B2333",
        border: "#2A3348",
        "text-primary": "#E4E8F1",
        "text-muted": "#7C8AA5",
        ok: "#4FD1A5",
        warn: "#E0A94E",
        danger: "#E0607A",
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "JetBrains Mono", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
