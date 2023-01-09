/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{ts,tsx}',
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        dark: '#121315',
        primary: '#3E4149',
      },
      fontFamily: {
        pretendard: [
          'Pretendard Variable',
          '-apple-system',
          'Noto Sans KR',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
}
