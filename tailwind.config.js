/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/pnl/**/*.{ts,tsx}'],
  prefix: '',
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        'primary-600': '#2563eb',
        'primary-700': '#1d4ed8',
        'primary-400': '#60a5fa',
        'primary-50': '#eff6ff',
        'primary-500': '#3b82f6',
      },
    },
  },
  plugins: [],
};
