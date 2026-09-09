/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{vue,js}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef7ff', 100: '#d9edff', 200: '#bce0ff', 300: '#8ecdff',
          400: '#59b0ff', 500: '#338fff', 600: '#1b6ef5', 700: '#1457e1',
          800: '#1747b6', 900: '#193f8f', 950: '#142857',
        },
      },
    },
  },
  plugins: [],
};
