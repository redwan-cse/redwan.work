// Service offerings — two views over the same business:
// - SERVICES_CATALOG: detailed catalog shown on /services (with tools)
// - SERVICES_HIGHLIGHTS: short marketing blurbs for the home-page carousel

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
  Target,
  Bell,
  Lock,
} from "lucide-react";

export interface CatalogService {
  icon: typeof Shield;
  title: string;
  description: string;
  tools: string[];
}

export const SERVICES_CATALOG: CatalogService[] = [
  {
    icon: Shield,
    title: "Penetration Testing & Vulnerability Assessment",
    description:
      "Simulate real-world attacks to identify security flaws in applications, networks, and infrastructure.",
    tools: ["Burp Suite", "Metasploit", "Nmap", "Nessus", "OWASP ZAP"],
  },
  {
    icon: Globe,
    title: "Web Application Security Testing",
    description:
      "Perform in-depth security testing to find vulnerabilities like SQL Injection, XSS, CSRF, and authentication flaws.",
    tools: ["Burp Suite", "Nikto", "Wapiti", "Zed Attack Proxy (ZAP)"],
  },
  {
    icon: Network,
    title: "Network Security Assessment",
    description:
      "Evaluate network security configurations to identify weak points and perform internal/external network scanning.",
    tools: ["Wireshark", "Nmap", "Snort", "Suricata"],
  },
  {
    icon: Cloud,
    title: "Cloud Security Assessment",
    description:
      "Audit cloud security configurations, review IAM security, and perform cloud compliance checks.",
    tools: ["AWS Inspector", "CloudTrail", "Azure Security Center"],
  },
  {
    icon: Search,
    title: "Open-Source Intelligence (OSINT)",
    description:
      "Conduct digital footprint analysis and identify leaked sensitive information using publicly available data.",
    tools: ["Maltego", "Recon-ng", "SpiderFoot"],
  },
  {
    icon: FileSearch,
    title: "Incident Response & Digital Forensics",
    description:
      "Investigate cybersecurity incidents, analyze malware, and recover compromised data with detailed forensic reports.",
    tools: ["Autopsy", "Volatility", "FTK Imager"],
  },
  {
    icon: Users,
    title: "Security Awareness Training",
    description:
      "Educate employees on phishing, social engineering, and best security practices with customized training sessions.",
    tools: ["Custom Training Materials", "Phishing Simulations"],
  },
  {
    icon: Server,
    title: "System Administration & Hardening",
    description:
      "Secure Linux and Windows servers against cyber threats and implement enterprise IT security best practices.",
    tools: ["Ansible", "SELinux", "UFW", "Group Policy Management"],
  },
  {
    icon: GitBranch,
    title: "Cloud DevOps & CI/CD Security",
    description:
      "Secure software delivery pipelines with best DevSecOps practices and automated security testing.",
    tools: ["Jenkins", "GitHub Actions", "AWS CodePipeline"],
  },
  {
    icon: Headphones,
    title: "Custom Cybersecurity Consultation",
    description:
      "Offer customized cybersecurity solutions and compliance audits based on client needs.",
    tools: ["ISO 27001", "GDPR", "HIPAA", "PCI-DSS"],
  },
];

export interface HighlightService {
  icon: typeof Shield;
  title: string;
  description: string;
}

export const SERVICES_HIGHLIGHTS: HighlightService[] = [
  {
    icon: Shield,
    title: "Penetration Testing & Vulnerability Assessment",
    description:
      "Comprehensive security testing to identify and exploit vulnerabilities in your systems.",
  },
  {
    icon: Target,
    title: "Red Teaming & Ethical Hacking",
    description:
      "Advanced adversary simulation to test your organization's detection and response capabilities.",
  },
  {
    icon: Bell,
    title: "SOC as a Service",
    description:
      "24/7 security monitoring and incident response to protect your digital assets.",
  },
  {
    icon: Search,
    title: "Digital Forensics & Incident Response",
    description:
      "Professional investigation of security incidents and data breaches.",
  },
  {
    icon: Lock,
    title: "OSINT & Dark Web Monitoring",
    description:
      "Continuous monitoring of dark web for leaked credentials and sensitive information.",
  },
  {
    icon: Server,
    title: "System Administration & Hardening",
    description:
      "Secure configuration and maintenance of servers and network infrastructure.",
  },
];
