/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Indigo of a volunteer's ink stamp + marigold of a community-event garland.
        ink: { DEFAULT: '#1B2333', soft: '#4A5468', faint: '#7A8396' },
        paper: { DEFAULT: '#F5F6F8', card: '#FFFFFF', line: '#E3E6EC' },
        brand: { 50: '#EEF0FB', 100: '#DCE0F6', 200: '#B7BEEC', 300: '#8D97DE', 400: '#5F6CCB', 500: '#3E4BB4', 600: '#313C99', 700: '#28307A', 800: '#1F255C', 900: '#171B44' },
        marigold: { 50: '#FFF7E6', 100: '#FEEBC2', 300: '#FBC85A', 400: '#F6B12A', 500: '#E99A0E', 600: '#C27C05', 700: '#8F5B04' },
        blood: { 50: '#FDEDEF', 100: '#FAD3D8', 500: '#C8102E', 600: '#A30D25', 700: '#7C0A1C' },
        leaf: { 50: '#E9F6EF', 100: '#C9EAD7', 500: '#1F8A5B', 600: '#18704A', 700: '#125638' },
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
        sans: ['"Hanken Grotesk"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        lift: '0 1px 2px rgba(27,35,51,.06), 0 4px 14px rgba(27,35,51,.05)',
      },
    },
  },
  plugins: [],
};
