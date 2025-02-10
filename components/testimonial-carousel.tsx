"use client"

import * as React from "react"
import useEmblaCarousel from "embla-carousel-react"
import Autoplay from "embla-carousel-autoplay"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card"
import Image from "next/image"

const testimonials = [
  {
    name: "John Smith",
    role: "CTO, TechSecure Inc",
    image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&h=400&fit=crop",
    content: "Redwan's penetration testing services were instrumental in identifying critical vulnerabilities in our infrastructure. His detailed reports and remediation suggestions were invaluable.",
    rating: 5
  },
  {
    name: "Sarah Johnson",
    role: "Security Director, FinTech Solutions",
    image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop",
    content: "The thoroughness of the security audit exceeded our expectations. Redwan's expertise in cloud security helped us achieve compliance with industry standards.",
    rating: 5
  },
  {
    name: "Michael Chen",
    role: "CEO, DataGuard Systems",
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop",
    content: "Working with Redwan on our red team engagement was eye-opening. His methodical approach to security testing revealed vulnerabilities we hadn't considered.",
    rating: 5
  },
  {
    name: "Emily Rodriguez",
    role: "CISO, Healthcare Solutions",
    image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=400&fit=crop",
    content: "The incident response training Redwan provided was exceptional. Our team is now better prepared to handle security incidents thanks to his expertise.",
    rating: 5
  },
  {
    name: "David Park",
    role: "IT Manager, E-commerce Plus",
    image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop",
    content: "Redwan's OSINT capabilities are remarkable. His investigation helped us identify and mitigate potential security risks before they could be exploited.",
    rating: 5
  },
  {
    name: "Lisa Thompson",
    role: "DevOps Lead, CloudTech",
    image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=400&fit=crop",
    content: "The security implementation in our CI/CD pipeline has significantly improved thanks to Redwan's expertise. His attention to detail is outstanding.",
    rating: 5
  },
  {
    name: "Robert Wilson",
    role: "COO, SecureNet",
    image: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&h=400&fit=crop",
    content: "Redwan's system hardening services helped us establish a robust security posture. His recommendations were practical and effective.",
    rating: 5
  },
  {
    name: "Anna Martinez",
    role: "Security Analyst, BankSecure",
    image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=400&fit=crop",
    content: "The digital forensics investigation conducted by Redwan was thorough and professional. His expertise helped us understand and prevent future incidents.",
    rating: 5
  }
]

export function TestimonialCarousel() {
  const [emblaRef] = useEmblaCarousel({ loop: true }, [
    Autoplay({ delay: 5000, stopOnInteraction: true })
  ])

  return (
    <div className="overflow-hidden" ref={emblaRef}>
      <div className="flex">
        {testimonials.map((testimonial, index) => (
          <div key={index} className="flex-[0_0_100%] min-w-0 pl-4 sm:flex-[0_0_50%] lg:flex-[0_0_33.333%]">
            <Card className="h-full">
              <CardHeader>
                <div className="flex items-center gap-4">
                  <div className="relative h-12 w-12 overflow-hidden rounded-full">
                    <Image
                      src={testimonial.image}
                      alt={testimonial.name}
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{testimonial.name}</CardTitle>
                    <CardDescription>{testimonial.role}</CardDescription>
                  </div>
                </div>
                <div className="mt-2 flex">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <svg
                      key={i}
                      className="h-5 w-5 fill-primary"
                      viewBox="0 0 20 20"
                    >
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{testimonial.content}</p>
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    </div>
  )
}