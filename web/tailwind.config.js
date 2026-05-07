import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    path.join(__dirname, "index.html"),
    path.join(__dirname, "src/**/*.{ts,tsx,js,jsx}"),
  ],
  theme: {
    extend: {
      colors: {
        govbr: {
          navy: "#071D41",
          blue: "#1351B4",
          deepblue: "#0D47A1",
          lightblue: "#E8F0FE",
          danger: "#B00020",
          dangerbg: "#FDECEA",
          warn: "#FFD54F",
          ok: "#4CAF50",
        },
      },
      fontFamily: {
        sans: [
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
