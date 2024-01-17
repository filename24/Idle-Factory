import type { Config } from 'tailwindcss'
import daisyui from 'daisyui'
import typography from '@tailwindcss/typography'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
      fontFamily: {
        pretendard: ['Pretendard Variable', '-apple-system', 'Noto Sans KR', 'sans-serif'],
      },
    },
  },
  plugins: [typography, daisyui],
  daisyui: {
    themes: false,
    darkTheme: 'dark',
    base: true,
    styled: true,
    utils: true,
    logs: true,
    themeRoot: ':root',
  },
}
export default config
