"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from "next-themes"
import { AppMotionProvider } from "@/components/motion/motion-provider"

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider {...props}>
      <AppMotionProvider>{children}</AppMotionProvider>
    </NextThemesProvider>
  )
}