/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        ink: {
          950: "#07080d",
          900: "#0b0f1a",
          800: "#111827",
          700: "#1f2937",
        },
        signal: {
          cyan: "#31d4ff",
          lime: "#a6ff4d",
          amber: "#ffb84d",
          rose: "#ff5c7a",
        },
      },
      boxShadow: {
        glow: "0 0 40px rgba(49, 212, 255, 0.18)",
      },
    },
  },
  plugins: [],
};
