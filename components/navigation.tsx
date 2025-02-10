"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Menu, Home, Briefcase, LayoutGrid, PenTool, FileText, Phone } from "lucide-react"
import { ModeToggle } from "@/components/mode-toggle"
import Image from "next/image"
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

const navigation = [
  { name: "Home", href: "/", icon: Home },
  { name: "Services", href: "/services", icon: Briefcase },
  { name: "Portfolio", href: "/portfolio", icon: LayoutGrid },
  { name: "Blogs", href: "/blogs", icon: PenTool },
  { name: "Resume", href: "/resume", icon: FileText },
  { name: "Contact", href: "/contact", icon: Phone },
]

export function Navigation() {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = React.useState(false)

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-20 items-center justify-between lg:h-24">
        {/* Logo Section */}
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center">
            <Image
              src="/profile.jpg"
              alt="Md Redwan Ahmed"
              width={60}
              height={60}
              className="rounded-full border-2 border-primary/10"
              priority
            />
            <span className="ml-3 hidden text-xl font-bold lg:block">
              Md Redwan Ahmed
            </span>
          </Link>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden items-center space-x-6 lg:flex">
          {navigation.map(({ name, href }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "text-sm font-medium transition-colors hover:text-primary",
                pathname === href ? "text-primary font-bold" : "text-muted-foreground"
              )}
            >
              {name}
            </Link>
          ))}
          <div className="flex items-center space-x-4">
            <ModeToggle />
            <Button asChild>
              <Link href="/contact">Hire Me</Link>
            </Button>
          </div>
        </nav>

        {/* Mobile Navigation */}
        <div className="flex items-center gap-4 lg:hidden">
          <ModeToggle />
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden">
                <Menu className="h-6 w-6" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[260px] bg-[#0a0f1c] text-white">
              <SheetHeader>
                <SheetTitle className="sr-only">Menu</SheetTitle>
              </SheetHeader>
              
              {/* Profile Section */}
              <div className="flex items-center gap-3 p-4 border-b border-gray-700">
                <Image
                  src="/profile.jpg"
                  alt="Md Redwan Ahmed"
                  width={50}
                  height={50}
                  className="rounded-full border-2 border-white/20"
                />
                <h1 className="text-lg font-semibold">Md Redwan Ahmed</h1>
              </div>

              {/* Navigation Links */}
              <nav className="mt-4 space-y-3 px-4">
                {navigation.map(({ name, href, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setIsOpen(false)}
                    className={cn(
                      "flex items-center gap-3 p-3 text-lg font-medium rounded-lg transition-all hover:bg-white/10",
                      pathname === href ? "bg-white/10 text-blue-400" : "text-white"
                    )}
                  >
                    <Icon className="h-5 w-5 text-blue-400" />
                    {name}
                  </Link>
                ))}
              </nav>

              {/* CTA Button */}
              <div className="mt-6 px-4">
                <Button asChild className="w-full bg-blue-500 hover:bg-blue-600">
                  <Link href="/contact">Hire Me</Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}