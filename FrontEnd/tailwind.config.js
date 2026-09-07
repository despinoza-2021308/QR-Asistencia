/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Plus Jakarta Sans', 'Inter', 'sans-serif'],
      },
      colors: {
        // Identidad Oficial ONE Consulting: Deep Navy & Bio-Teal
        navy: {
          950: '#060a12',
          900: '#0a101d',
          850: '#0e1626',
          800: '#141f36',
          700: '#1e2e4f',
          600: '#2b406c',
        },
        brand: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6', // Teal distintivo del checkmark ONE
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
          950: '#042f2e',
        },
        corp: {
          blue: '#0a3d7e', // Azul institucional ONE
          coral: '#e63946', // Acento eslogan
        }
      }
    },
  },
  plugins: [],
}
