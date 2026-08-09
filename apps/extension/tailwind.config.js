/** @type {import('tailwindcss').Config} */
module.exports = {
  mode: "jit",
  darkMode: "class",
  content: ["./**/*.tsx", "./src/popup.tsx", "./src/style.css"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        serif: ['Poppins', 'sans-serif'],
        mono: ['Poppins', 'sans-serif']
      }
    }
  },
  plugins: []
}