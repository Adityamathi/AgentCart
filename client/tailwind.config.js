/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F7F4EE',
        surface: '#FDFBF7',
        raised: '#EFE9DF',
        ink: '#1F1B16',
        'ink-2': '#5E554A',
        'ink-3': '#7B7266',
        line: 'rgba(31, 27, 22, 0.10)',
        'line-strong': 'rgba(31, 27, 22, 0.20)',
        accent: '#1F3ED9',
        'accent-ink': '#16309F',
        'accent-wash': '#E8EAF8',
        positive: '#1D7A4D',
        'positive-wash': '#E4EFE7',
        warn: '#8A5A15',
        'warn-wash': '#F2E9D8',
        negative: '#A33429',
        'negative-wash': '#F5E4E0',
        night: '#14120F',
        'night-2': '#1D1A16',
        'night-3': '#26221D',
        'night-line': 'rgba(239, 233, 222, 0.13)',
        'night-ink': '#EFE9DE',
        'night-ink-2': '#A79E90',
        'night-ink-3': '#857C6E',
      },
      fontFamily: {
        sans: ['"Instrument Sans"', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'],
        display: ['"Instrument Serif"', 'Georgia', 'Times New Roman', 'serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '8px',
        md: '10px',
        lg: '14px',
        xl: '18px',
      },
      boxShadow: {
        sheet: '0 1px 2px rgba(31, 27, 22, 0.05)',
        lift: '0 8px 24px rgba(31, 27, 22, 0.08)',
      },
      transitionTimingFunction: {
        ease: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
};
