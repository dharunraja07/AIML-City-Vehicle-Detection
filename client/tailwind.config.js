/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        darkBg: "#0B0F19",
        cardBg: "#111827",
        panelBg: "#1F2937",
        accentBlue: "#3B82F6",
        accentRed: "#EF4444",
        accentGreen: "#10B981",
        accentYellow: "#F59E0B"
      }
    },
  },
  plugins: [],
}
