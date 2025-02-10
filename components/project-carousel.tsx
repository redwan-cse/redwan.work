"use client"

import * as React from "react"
import useEmblaCarousel from "embla-carousel-react"
import { Button } from "./ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card"
import { ChevronLeft, ChevronRight } from "lucide-react"
import Image from "next/image"
import Link from "next/link"

const projects = [
  {
    title: "Web Application Penetration Testing",
    description: "In-depth security testing of e-commerce platform identifying critical vulnerabilities.",
    image: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=800&h=400&fit=crop",
    tech: ["Burp Suite", "OWASP ZAP", "SQLMap"],
    link: "/portfolio"
  },
  {
    title: "Incident Response & Forensics",
    description: "Digital forensics investigation and incident response for ransomware attack.",
    image: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&h=400&fit=crop",
    tech: ["Volatility", "Autopsy", "FTK"],
    link: "/portfolio"
  },
  {
    title: "OSINT Investigation for a Fraud Case",
    description: "Conducted an online investigation to track a scammer's digital footprint using passive and active OSINT techniques.",
    image: "https://images.unsplash.com/photo-1563986768609-322da13575f3?w=800&h=400&fit=crop",
    tech: ["Maltego", "SpiderFoot", "Shodan"],
    link: "/portfolio"
  },
  {
    title: "Linux Server Security Hardening",
    description: "Implemented security measures on a Linux-based cloud server hosting critical applications.",
    image: "https://images.unsplash.com/photo-1629654297299-c8506221ca97?w=800&h=400&fit=crop",
    tech: ["SELinux", "UFW", "Fail2Ban", "Ansible"],
    link: "/portfolio"
  },
  {
    title: "Cloud Infrastructure Hardening",
    description: "Implementation of security best practices and compliance standards for AWS environment.",
    image: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&h=400&fit=crop",
    tech: ["AWS Security", "CloudTrail", "IAM"],
    link: "/portfolio"
  },
]

export function ProjectCarousel() {
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
          {projects.map((project, index) => (
            <div key={index} className="flex-[0_0_100%] min-w-0 pl-4 sm:flex-[0_0_50%] lg:flex-[0_0_33.333%]">
              <Card className="group h-full flex flex-col overflow-hidden">
                <div className="relative aspect-video">
                  <Image
                    src={project.image}
                    alt={project.title}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-110"
                  />
                </div>
                <CardHeader className="flex-grow">
                  <CardTitle className="line-clamp-2">{project.title}</CardTitle>
                  <CardDescription className="line-clamp-2">{project.description}</CardDescription>
                </CardHeader>
                <CardContent className="mt-auto">
                  <div className="mb-4 flex flex-wrap gap-2">
                    {project.tech.map((tech) => (
                      <span
                        key={tech}
                        className="rounded-full bg-primary/10 px-3 py-1 text-sm text-primary"
                      >
                        {tech}
                      </span>
                    ))}
                  </div>
                  <Button asChild className="w-full">
                    <Link href={project.link}>View Project</Link>
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