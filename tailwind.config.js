/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/pnl/**/*.{ts,tsx}',
    './src/components/ShipmentStatusScreen.tsx',
    './src/pages/guest/**/*.{ts,tsx}',
    './src/components/shadcn/**/*.{ts,tsx}',
  ],
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
        haulz: {
          brand: '#3655ff',
          'brand-soft': '#ebf0ff',
        },
      },
      borderRadius: {
        guest: '1.25rem',
      },
      boxShadow: {
        guest: '0 8px 30px rgba(15, 23, 42, 0.06)',
        'guest-lg': '0 20px 50px rgba(15, 23, 42, 0.08)',
      },
      maxWidth: {
        guest: '72rem',
      },
    },
  },
  plugins: [],
};
