/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Neutral dark console palette for the public project cockpit.
        brand: {
          50: 'rgba(255,255,255,0.08)',
          100: 'rgba(255,255,255,0.12)',
          200: 'rgba(255,255,255,0.18)',
          400: '#8de9ff',
          500: '#65d7f0',
          600: '#ffffff',
          700: '#d9f8ff',
        },
        ink: {
          900: '#ffffff',
          700: 'rgba(255,255,255,0.76)',
          500: 'rgba(255,255,255,0.52)',
          400: 'rgba(255,255,255,0.34)',
        },
      },
      boxShadow: {
        card: '0 20px 80px rgba(0,0,0,0.28)',
      },
      borderRadius: {
        xl2: '8px',
      },
    },
  },
  plugins: [],
};
