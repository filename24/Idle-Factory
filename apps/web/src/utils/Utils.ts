// https://github.com/koreanbots/core
export function systemTheme() {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)')?.matches
      ? 'dark'
      : 'light'
  } catch {
    return 'dark'
  }
}
