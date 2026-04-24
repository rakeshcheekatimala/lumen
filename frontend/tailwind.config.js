/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'graph-bg': '#080c14',
        'panel-bg': '#0d1526',
        'card-bg': '#111827',
        'border-dim': '#1e2d45',
        'accent-cyan': '#06b6d4',
        'accent-blue': '#3b82f6',
        'risk-critical': '#ef4444',
        'risk-high': '#f97316',
        'risk-medium': '#eab308',
        'risk-low': '#22c55e',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px #06b6d4, 0 0 10px #06b6d4' },
          '100%': { boxShadow: '0 0 20px #06b6d4, 0 0 40px #06b6d4' },
        },
      },
    },
  },
  plugins: [],
}
