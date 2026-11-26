"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider, useTheme, type ThemeProviderProps } from "next-themes"
import { AppMotionProvider } from "@/components/motion/motion-provider"
import {
  COOKIE_PREFERENCES_CHANGED_EVENT,
  allowsExperienceStorage,
} from "@/components/cookie-preferences"

function ThemeConsentGuard({ storageKey = "theme" }: { storageKey?: string }) {
  const { theme } = useTheme()

  React.useEffect(() => {
    const enforce = () => {
      try {
        if (!allowsExperienceStorage()) {
          window.localStorage.removeItem(storageKey)
        }
      } catch {
        // Ignore storage errors in restricted browsing contexts
      }
    }
    enforce()
    window.addEventListener(COOKIE_PREFERENCES_CHANGED_EVENT, enforce)
    return () => {
      window.removeEventListener(COOKIE_PREFERENCES_CHANGED_EVENT, enforce)
    }
  }, [storageKey, theme])

  return null
}

export function ThemeProvider({ children, storageKey = "theme", ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider storageKey={storageKey} {...props}>
      <ThemeConsentGuard storageKey={storageKey} />
      <AppMotionProvider>{children}</AppMotionProvider>
    </NextThemesProvider>
  )
}
