import type { Config } from 'tailwindcss'

// GoPortals brand — taken from the logo:
//   brand (teal-blue "PORTALS") #045E80 · lime ("GO") #95C12C · navy accent #28378F
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#EAF4F8',
          100: '#CFE6EF',
          200: '#9FCCDE',
          300: '#63A9C4',
          400: '#2A87AA',
          500: '#0A6F94',
          600: '#045E80',
          700: '#034C68',
          800: '#033B51',
          900: '#022B3B',
          950: '#011B26',
        },
        lime: {
          50:  '#F5FAE8',
          100: '#E8F3C8',
          200: '#D3E896',
          300: '#BADA5E',
          400: '#A5CD3F',
          500: '#95C12C',
          600: '#789C20',
          700: '#5B771A',
          800: '#465B17',
          900: '#394B16',
        },
        navy: '#28378F',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(2 43 59 / 0.04), 0 1px 3px 0 rgb(2 43 59 / 0.06)',
        pop:  '0 10px 30px -10px rgb(2 43 59 / 0.25)',
      },
    },
  },
  plugins: [],
}

export default config
