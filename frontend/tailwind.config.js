/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        background: '#f3f6f9',
        foreground: '#101828',
        card: '#ffffff',
        'card-foreground': '#101828',
        border: '#dbe4ee',
        input: '#cfd9e5',
        ring: '#0a4d84',
        muted: '#eaf0f6',
        'muted-foreground': '#5f6c7d',
        primary: {
          DEFAULT: '#0a4d84',
          50: '#e7f2fb',
          100: '#d4e8f8',
          500: '#0a4d84',
          600: '#083f6e',
          700: '#073158',
          foreground: '#ffffff',
        },
        accent: {
          DEFAULT: '#d58b1c',
          100: '#f9ebcf',
          500: '#d58b1c',
          600: '#b87617',
          foreground: '#3a2400',
        },
      },
      boxShadow: {
        soft: '0 16px 38px -22px rgba(16, 24, 40, 0.38)',
        glow: '0 0 0 3px rgba(10, 77, 132, 0.17)',
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
        floatIn: {
          '0%': { opacity: '0', transform: 'translateY(18px) scale(0.995)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.72' },
        },
      },
      animation: {
        'fade-in': 'fadeIn 220ms ease-out',
        'slide-up': 'slideUp 260ms ease-out',
        'float-in': 'floatIn 420ms cubic-bezier(.2,.8,.2,1)',
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
