/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          red:       '#B30000',
          redDark:   '#8B0000',
          redLight:  '#FEF2F2',
          redMid:    '#FECACA',
          black:     '#111111',
          charcoal:  '#1E1E1E',
          gray:      '#6B7280',
          lightGray: '#F8F8F8',
          border:    '#E5E7EB',
        },
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card:   '0 1px 3px 0 rgba(0,0,0,0.08), 0 1px 2px -1px rgba(0,0,0,0.05)',
        md:     '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        cardHover: '0 4px 12px 0 rgba(0,0,0,0.10)',
        sidebar: '4px 0 24px rgba(0,0,0,0.06)',
      },
    },
  },
  plugins: [],
};
