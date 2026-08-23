import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ExternalLink } from "lucide-react"
import Image from "next/image"
import type { Metadata } from "next"
import { PROJECTS, PROJECT_CATEGORIES } from "@/lib/content/projects"

export const metadata: Metadata = {
  title: "Project Portfolio",
  description:
    "Real-world cybersecurity projects: penetration testing, cloud security audits, incident response, OSINT investigations, DevSecOps, and security training.",
  alternates: { canonical: "/portfolio" },
  openGraph: {
    title: "Project Portfolio",
    description:
      "Real-world cybersecurity projects: penetration testing, cloud security audits, incident response, OSINT investigations, DevSecOps, and security training.",
    type: "website",
  },
}

const categories = PROJECT_CATEGORIES

export default function Portfolio() {
  return (
    <div className="container py-12">
      <div className="mx-auto max-w-4xl text-center">
        <h1 className="mb-4 text-4xl font-bold">Project Portfolio</h1>
        <p className="mb-12 text-lg text-muted-foreground">
          Showcasing my expertise through real-world cybersecurity projects and solutions
        </p>

        <div className="mb-8 flex flex-wrap justify-center gap-2">
          {categories.map((category) => (
            <Badge key={category} variant="secondary" className="text-sm">
              {category}
            </Badge>
          ))}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {PROJECTS.map((project, index) => (
          <Card key={index} className="overflow-hidden flex flex-col h-full">
            <div className="relative h-[200px]">
              <Image
                src={project.image}
                alt={project.title}
                fill
                className="object-cover transition-transform duration-300 hover:scale-105"
              />
            </div>
            <CardHeader className="flex-grow">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl">{project.title}</CardTitle>
                <Badge variant="outline">{project.category}</Badge>
              </div>
              <CardDescription>{project.description}</CardDescription>
            </CardHeader>
            <CardContent className="mt-auto">
              <div className="mb-4 flex flex-wrap gap-2">
                {project.tech.map((tech) => (
                  <Badge key={tech} variant="secondary">
                    {tech}
                  </Badge>
                ))}
              </div>
              <Button asChild className="w-full">
                <a href="/contact" className="inline-flex items-center justify-center">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Learn More
                </a>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
