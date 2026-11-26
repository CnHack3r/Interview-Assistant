/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#1f6feb',
          foreground: '#ffffff',
          50: '#eef4ff',
          100: '#dbe7fe',
          600: '#1f6feb',
          700: '#1a5fd0',
        },
      },
    },
  },
  plugins: [],
};
