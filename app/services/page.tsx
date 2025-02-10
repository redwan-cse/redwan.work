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
import {
  Shield,
  Globe,
  Network,
  Cloud,
  Search,
  FileSearch,
  Users,
  Server,
  GitBranch,
  Headphones,
} from "lucide-react"

const services = [
  {
    icon: Shield,
    title: "Penetration Testing & Vulnerability Assessment",
    description: "Simulate real-world attacks to identify security flaws in applications, networks, and infrastructure.",
    tools: ["Burp Suite", "Metasploit", "Nmap", "Nessus", "OWASP ZAP"],
  },
  {
    icon: Globe,
    title: "Web Application Security Testing",
    description: "Perform in-depth security testing to find vulnerabilities like SQL Injection, XSS, CSRF, and authentication flaws.",
    tools: ["Burp Suite", "Nikto", "Wapiti", "Zed Attack Proxy (ZAP)"],
  },
  {
    icon: Network,
    title: "Network Security Assessment",
    description: "Evaluate network security configurations to identify weak points and perform internal/external network scanning.",
    tools: ["Wireshark", "Nmap", "Snort", "Suricata"],
  },
  {
    icon: Cloud,
    title: "Cloud Security Assessment",
    description: "Audit cloud security configurations, review IAM security, and perform cloud compliance checks.",
    tools: ["AWS Inspector", "CloudTrail", "Azure Security Center"],
  },
  {
    icon: Search,
    title: "Open-Source Intelligence (OSINT)",
    description: "Conduct digital footprint analysis and identify leaked sensitive information using publicly available data.",
    tools: ["Maltego", "Recon-ng", "SpiderFoot"],
  },
  {
    icon: FileSearch,
    title: "Incident Response & Digital Forensics",
    description: "Investigate cybersecurity incidents, analyze malware, and recover compromised data with detailed forensic reports.",
    tools: ["Autopsy", "Volatility", "FTK Imager"],
  },
  {
    icon: Users,
    title: "Security Awareness Training",
    description: "Educate employees on phishing, social engineering, and best security practices with customized training sessions.",
    tools: ["Custom Training Materials", "Phishing Simulations"],
  },
  {
    icon: Server,
    title: "System Administration & Hardening",
    description: "Secure Linux and Windows servers against cyber threats and implement enterprise IT security best practices.",
    tools: ["Ansible", "SELinux", "UFW", "Group Policy Management"],
  },
  {
    icon: GitBranch,
    title: "Cloud DevOps & CI/CD Security",
    description: "Secure software delivery pipelines with best DevSecOps practices and automated security testing.",
    tools: ["Jenkins", "GitHub Actions", "AWS CodePipeline"],
  },
  {
    icon: Headphones,
    title: "Custom Cybersecurity Consultation",
    description: "Offer customized cybersecurity solutions and compliance audits based on client needs.",
    tools: ["ISO 27001", "GDPR", "HIPAA", "PCI-DSS"],
  },
]

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
        {services.map((service, index) => (
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