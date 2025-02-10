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

const projects = [
  {
    title: "Corporate Web Application Penetration Testing",
    description: "Conducted a full security assessment for a corporate web app, identifying and patching SQL Injection, XSS, and misconfigurations.",
    image: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=800&h=400&fit=crop",
    tech: ["Burp Suite", "OWASP ZAP", "SQLMap"],
    category: "Penetration Testing",
  },
  {
    title: "Cloud Security Audit for an E-Commerce Startup",
    description: "Audited AWS cloud infrastructure for security misconfigurations and implemented IAM role-based access control and encryption policies.",
    image: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&h=400&fit=crop",
    tech: ["AWS Inspector", "AWS CloudTrail", "IAM"],
    category: "Cloud Security",
  },
  {
    title: "Network Security Assessment for a Financial Institution",
    description: "Conducted internal & external penetration testing and improved firewall and IDS/IPS configurations.",
    image: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&h=400&fit=crop",
    tech: ["Nmap", "Snort", "Wireshark"],
    category: "Network Security",
  },
  {
    title: "Incident Response & Malware Analysis",
    description: "Investigated and mitigated a ransomware attack, recovered encrypted data and provided forensic reports.",
    image: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&h=400&fit=crop",
    tech: ["Volatility", "Autopsy", "FTK Imager"],
    category: "Digital Forensics",
  },
  {
    title: "OSINT Investigation for a Fraud Case",
    description: "Conducted an online investigation to track a scammer's digital footprint using passive and active OSINT techniques.",
    image: "https://images.unsplash.com/photo-1563986768609-322da13575f3?w=800&h=400&fit=crop",
    tech: ["Maltego", "SpiderFoot", "Shodan"],
    category: "OSINT",
  },
  {
    title: "CI/CD Security Implementation",
    description: "Integrated security into the DevOps pipeline to prevent vulnerabilities in production with automated security scanning.",
    image: "https://images.unsplash.com/photo-1618401471353-b98afee0b2eb?w=800&h=400&fit=crop",
    tech: ["GitHub Actions", "OWASP Dependency-Check", "Trivy"],
    category: "DevSecOps",
  },
  {
    title: "Custom Cybersecurity Training Program",
    description: "Developed and conducted training for 100+ employees covering phishing simulations and secure coding practices.",
    image: "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=800&h=400&fit=crop",
    tech: ["Training Materials", "Phishing Simulations", "Security Awareness"],
    category: "Training",
  },
  {
    title: "Linux Server Security Hardening",
    description: "Implemented security measures on a Linux-based cloud server hosting critical applications.",
    image: "https://images.unsplash.com/photo-1629654297299-c8506221ca97?w=800&h=400&fit=crop",
    tech: ["SELinux", "UFW", "Fail2Ban", "Ansible"],
    category: "System Administration",
  },
  {
    title: "Phishing URL Detection System",
    description: "Developed an ML-based phishing detection system for identifying malicious URLs, presented at IEEE CS BDC Symposium 2024.",
    image: "https://images.unsplash.com/photo-1516321165247-4aa89a48be28?w=800&h=400&fit=crop",
    tech: ["Python", "Scikit-Learn", "TensorFlow"],
    category: "Research",
  },
  {
    title: "Automated Penetration Testing Framework",
    description: "Developed a custom Python-based penetration testing script for automating security tests.",
    image: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800&h=400&fit=crop",
    tech: ["Python", "Nmap", "Metasploit"],
    category: "Development",
  },
]

const categories = Array.from(new Set(projects.map(project => project.category)))

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
        {projects.map((project, index) => (
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
