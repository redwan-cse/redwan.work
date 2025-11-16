import { Button } from "@/components/ui/button"
import { ExternalLink } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { TestimonialCarousel } from "@/components/testimonial-carousel"
import { ProjectCarousel } from "@/components/project-carousel"
import { ServicesGrid } from "@/components/services-grid"

export default function Home() {
  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="container min-h-[calc(100vh-6rem)] md:min-h-[calc(100vh-7rem)]">
        <div className="grid min-h-[calc(100vh-6rem)] items-center gap-8 py-20 md:min-h-[calc(100vh-7rem)] md:grid-cols-2">
          <div className="flex flex-col gap-6">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
              Hi, I'm{" "}
              <span className="bg-gradient-to-r from-primary to-primary/50 bg-clip-text text-transparent">
                Md Redwan Ahmed
              </span>
            </h1>
            <h2 className="text-xl text-muted-foreground sm:text-2xl">
              Founder & CEO of Fast Cyber Defense
            </h2>
            <p className="max-w-[600px] text-lg text-muted-foreground">
              Leading cybersecurity expert specializing in penetration testing, vulnerability assessments, 
              and security consulting. Protecting digital assets and ensuring cyber resilience for businesses worldwide.
            </p>
            <div className="flex flex-wrap gap-4">
              <Button asChild size="lg" className="text-lg">
                <a
                  href="https://www.fiverr.com/redwancse"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2"
                >
                  Hire on Fiverr
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
              <Button asChild variant="outline" size="lg" className="text-lg">
                <a
                  href="https://www.upwork.com/freelancers/redwancse"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2"
                >
                  Hire on Upwork
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>
          <div className="relative mx-auto aspect-square w-full max-w-md hidden md:block">
            <Image
              src="/profile.jpg"
              alt="Md Redwan Ahmed"
              fill
              className="rounded-full object-cover transition-transform duration-300 hover:scale-105"
              priority
            />
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section className="border-t bg-muted/50">
        <div className="container py-20">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-3xl font-bold md:text-4xl">Services & Expertise</h2>
            <p className="text-lg text-muted-foreground">
              Comprehensive cybersecurity solutions for your business
            </p>
          </div>
          <div className="overflow-hidden">
            <ServicesGrid />
          </div>
        </div>
      </section>

      {/* Featured Projects Section */}
      <section className="container py-20">
        <div className="mb-12 text-center">
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">Featured Projects</h2>
          <p className="text-lg text-muted-foreground">
            Explore our recent cybersecurity work and success stories
          </p>
        </div>
        <div className="overflow-hidden">
          <ProjectCarousel />
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="border-t bg-muted/50">
        <div className="container py-20">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-3xl font-bold md:text-4xl">Client Testimonials</h2>
            <p className="text-lg text-muted-foreground">
              What our clients say about our cybersecurity services
            </p>
          </div>
          <TestimonialCarousel />
        </div>
      </section>

      {/* CTA Section */}
      <section className="container py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            Ready to Secure Your Business?
          </h2>
          <p className="mb-8 text-lg text-muted-foreground">
            Get in touch to discuss how we can help protect your digital assets
          </p>
          <div className="flex justify-center gap-4">
            <Button asChild size="lg">
              <Link href="/contact">Contact Us</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a
                href="https://cal.com/redwancse"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center"
              >
                <ExternalLink className="mr-2 h-5 w-5" />
                Schedule a Call
              </a>
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}