"use client"

import { MessageCircle } from "lucide-react"

export function WhatsAppButton() {
  return (
    <a
      href="https://wa.me/8801776387624"
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-50 flex h-[50px] w-[50px] items-center justify-center rounded-full bg-[#25D366] shadow-lg transition-transform duration-200 hover:scale-110 hover:shadow-xl"
      aria-label="Contact on WhatsApp"
    >
      <MessageCircle className="h-6 w-6 text-white" />
    </a>
  )
}