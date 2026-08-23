import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import type { Metadata } from "next"
import { SERVICES_CATALOG } from "@/lib/content/services"

export const metadata: Metadata = {
  title: "Cybersecurity Services",
  description:
    "Penetration testing, web application security, network and cloud assessments, OSINT, incident response, security training, and DevSecOps consulting.",
  alternates: { canonical: "/services" },
  openGraph: {
    title: "Cybersecurity Services",
    description:
      "Penetration testing, web application security, network and cloud assessments, OSINT, incident response, security training, and DevSecOps consulting.",
    type: "website",
  },
}

export default function Services() {
  return (
    <div className="container py-12">
      <div className="mx-auto max-w-4xl text-center">
        <h1 className="mb-4 text-4xl font-bold">Cybersecurity Services</h1>
        <p className="mb-12 text-lg text-muted-foreground">
          Comprehensive security solutions to protect your digital assets and infrastructure
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {SERVICES_CATALOG.map((service, index) => (
          <Card key={index} className="flex flex-col">
            <CardHeader>
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <service.icon className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="text-xl">{service.title}</CardTitle>
              <CardDescription>{service.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col justify-between gap-6">
              <div className="flex flex-wrap gap-2">
                {service.tools.map((tool) => (
                  <Badge key={tool} variant="secondary">
                    {tool}
                  </Badge>
                ))}
              </div>
              <Button asChild className="w-full">
                <Link href="/contact">Hire Me</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}