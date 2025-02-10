"use client"

import * as React from "react"
import {
  Shield,
  Target,
  Bell,
  Search,
  Server,
  Lock
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Button } from "./ui/button"
import Link from "next/link"
import useEmblaCarousel from "embla-carousel-react"
import { ChevronLeft, ChevronRight } from "lucide-react"

const services = [
  {
    icon: Shield,
    title: "Penetration Testing & Vulnerability Assessment",
    description: "Comprehensive security testing to identify and exploit vulnerabilities in your systems.",
  },
  {
    icon: Target,
    title: "Red Teaming & Ethical Hacking",
    description: "Advanced adversary simulation to test your organization's detection and response capabilities.",
  },
  {
    icon: Bell,
    title: "SOC as a Service",
    description: "24/7 security monitoring and incident response to protect your digital assets.",
  },
  {
    icon: Search,
    title: "Digital Forensics & Incident Response",
    description: "Professional investigation of security incidents and data breaches.",
  },
  {
    icon: Lock,
    title: "OSINT & Dark Web Monitoring",
    description: "Continuous monitoring of dark web for leaked credentials and sensitive information.",
  },
  {
    icon: Server,
    title: "System Administration & Hardening",
    description: "Secure configuration and maintenance of servers and network infrastructure.",
  },
]

export function ServicesGrid() {
  const [emblaRef, emblaApi] = useEmblaCarousel({ 
    align: "start",
    loop: true,
    dragFree: true,
  })

  const scrollPrev = React.useCallback(() => {
    if (emblaApi) emblaApi.scrollPrev()
  }, [emblaApi])

  const scrollNext = React.useCallback(() => {
    if (emblaApi) emblaApi.scrollNext()
  }, [emblaApi])

  return (
    <div className="relative">
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex">
          {services.map((service, index) => (
            <div key={index} className="flex-[0_0_100%] min-w-0 pl-4 sm:flex-[0_0_50%] lg:flex-[0_0_33.333%]">
              <Card className="group h-full flex flex-col">
                <CardHeader>
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                    <service.icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-xl">{service.title}</CardTitle>
                  <CardDescription>{service.description}</CardDescription>
                </CardHeader>
                <CardContent className="mt-auto">
                  <Button asChild className="w-full">
                    <Link href="/contact">Learn More</Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-background/80 backdrop-blur-sm"
        onClick={scrollPrev}
      >
        <ChevronLeft className="h-6 w-6" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-background/80 backdrop-blur-sm"
        onClick={scrollNext}
      >
        <ChevronRight className="h-6 w-6" />
      </Button>
    </div>
  )
}