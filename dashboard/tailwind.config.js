/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        vlc: {
          50:  "#f0f4f8",
          100: "#d9e4f0",
          200: "#b3cae1",
          300: "#7da5c8",
          400: "#4d7faa",
          500: "#2d5f8f",
          600: "#1e3a5f",   // primary
          700: "#162d4a",
          800: "#0f1f34",
          900: "#0a1520",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
      },
      animation: {
        "fade-in":   "fadeIn .2s ease",
        "slide-in":  "slideIn .25s ease",
        "bounce-in": "bounceIn .3s cubic-bezier(0.34,1.56,0.64,1)",
      },
      keyframes: {
        fadeIn:   { from: { opacity: 0 }, to: { opacity: 1 } },
        slideIn:  { from: { opacity: 0, transform: "translateY(8px)" }, to: { opacity: 1, transform: "translateY(0)" } },
        bounceIn: { from: { opacity: 0, transform: "scale(0.95)" }, to: { opacity: 1, transform: "scale(1)" } },
      },
    },
  },
  plugins: [],
};
