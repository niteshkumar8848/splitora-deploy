/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        background: '#f2f5f8',
        foreground: '#111827',
        card: '#ffffff',
        'card-foreground': '#111827',
        border: '#dde3ea',
        input: '#cfd8e3',
        ring: '#0f4c81',
        muted: '#e9eef4',
        'muted-foreground': '#5b6472',
        primary: {
          DEFAULT: '#0f4c81',
          50: '#e7f1fa',
          100: '#d4e7f7',
          500: '#0f4c81',
          600: '#0c416f',
          700: '#0a3357',
          foreground: '#ffffff',
        },
        accent: {
          DEFAULT: '#c48a2a',
          100: '#f7ecd7',
          500: '#c48a2a',
          600: '#a8701f',
          foreground: '#2f1d03',
        },
      },
      boxShadow: {
        soft: '0 20px 45px -28px rgba(17, 24, 39, 0.38)',
        glow: '0 0 0 3px rgba(15, 76, 129, 0.16)',
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
