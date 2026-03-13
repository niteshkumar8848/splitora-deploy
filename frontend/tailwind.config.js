/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        background: '#f8fafc',
        foreground: '#0f172a',
        card: '#ffffff',
        'card-foreground': '#0f172a',
        border: '#e2e8f0',
        input: '#d7dfeb',
        ring: '#4f46e5',
        muted: '#edf2f7',
        'muted-foreground': '#64748b',
        primary: {
          DEFAULT: '#4f46e5',
          50: '#eef2ff',
          100: '#e0e7ff',
          500: '#4f46e5',
          600: '#4338ca',
          700: '#3730a3',
          foreground: '#ffffff',
        },
        accent: {
          DEFAULT: '#14b8a6',
          100: '#ccfbf1',
          500: '#14b8a6',
          600: '#0d9488',
          foreground: '#042f2e',
        },
      },
      boxShadow: {
        soft: '0 10px 30px -12px rgba(15, 23, 42, 0.22)',
        glow: '0 0 0 3px rgba(79, 70, 229, 0.18)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.72' },
        },
      },
      animation: {
        'fade-in': 'fadeIn 220ms ease-out',
        'slide-up': 'slideUp 260ms ease-out',
        'pulse-soft': 'pulseSoft 1.8s ease-in-out infinite',
      },
      borderRadius: {
        xl: '0.9rem',
        '2xl': '1.2rem',
      },
    },
  },
  plugins: [],
};
