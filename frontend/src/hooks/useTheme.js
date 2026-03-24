import { useEffect, useState } from 'react'

/**
 * useTheme — manages light/dark mode.
 * Persists preference in localStorage.
 * Applies `data-theme` attribute on <html> element so App.css variables kick in.
 */
export function useTheme() {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('masterauto_theme') || 'dark'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('masterauto_theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))

  return { theme, toggleTheme, isDark: theme === 'dark' }
}
