import { createContext, useContext } from 'react'
import { createTheme, type Theme } from './tokens'

export const ThemeContext = createContext<Theme>(createTheme(false))

export function useTheme(): Theme {
  return useContext(ThemeContext)
}
