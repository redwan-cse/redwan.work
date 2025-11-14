import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Download, ExternalLink, Mail, Phone, MapPin, Linkedin, Github, Globe, Briefcase, GraduationCap, Award, Users, BookOpen, Heart } from "lucide-react"
import Link from "next/link"

export const metadata = {
  title: "Resume - Md Redwan Ahmed",
  description: "Professional resume of Md Redwan Ahmed - Cybersecurity Expert, Penetration Tester, and System Administrator",
}

const personalInfo = {
  name: "Md Redwan Ahmed",
  title: "Founder & CEO of Fast Cyber Defense",
  subtitle: "Cybersecurity Expert | Penetration Tester | System Administrator",
  email: "redwan@example.com",
  phone: "+880 123 456 7890",
  location: "Dhaka, Bangladesh",
  linkedin: "https://www.linkedin.com/in/redwancse",
  github: "https://github.com/redwan-cse",
  website: "https://redwan.work",
}

const technicalSkills = {
  "Cybersecurity & Networking": [
    "Ethical Hacking",
    "Vulnerability Assessment & Penetration Testing (VAPT)",
    "Open-Source Intelligence (OSINT)",
    "Cryptography",
    "Networking Protocols & Standards",
    "Network Troubleshooting & Security",
    "Security Tools & Exploits",
  ],
  "System Administration": [
    "Linux System Administration (CentOS, Ubuntu Server)",
    "Configuration Management (Ansible)",
    "Virtualization & Containerization (Docker, Kubernetes)",
    "Backup & Recovery Solutions",
    "Cloud Computing (AWS, DigitalOcean, Azure)",
    "Identity & Access Management (IAM)",
  ],
  "Cloud & DevOps": [
    "Command-Line Interface (CLI) Proficiency",
    "Infrastructure as Code (IaC)",
    "CI/CD Pipelines (GitHub Actions, Jenkins)",
    "Cloud Security Best Practices",
    "Monitoring & Logging",
  ],
  "Programming & Scripting": [
    "Python, Java, C, C++",
    "MySQL, PHP, C#",
    "PowerShell & Shell Scripting",
    "Batch Scripting",
  ],
}

const softSkills = [
  "Analytical Thinking & Problem-Solving",
  "Team Collaboration & Leadership",
  "Effective Communication & Public Speaking",
  "Project & Time Management",
  "Commitment & Adaptability",
]

const otherSkills = [
  "MS Office 365 & Google Workspace",
  "Technical Support & Troubleshooting",
  "Self-Learning & Research Capabilities",
]

const hobbies = [
  {
    name: "Coding & Programming",
    description: "Skilled in multiple languages and eager to develop cybersecurity solutions.",
  },
  {
    name: "Capture The Flag (CTF) Challenges",
    description: "Passionate about cybersecurity problem-solving and ethical hacking competitions.",
  },
  {
    name: "Traveling",
    description: "Enthusiastic traveler, exploring diverse cultures and environments to enhance adaptability.",
  },
]

const research = {
  journal: {
    title: "Data-Driven Strategies for Digital Native Market Segmentation Using Clustering",
    details: [
      "Journal: International Journal of Cognitive Computing in Engineering",
      "Indexing: Scopus",
      "Quartile: Q1",
      "Cite Score: 8",
      "Publisher: Elsevier",
    ],
  },
  conference: {
    title: "Phishing URL Detection Using Comprehensive Feature Extraction and Machine Learning Techniques",
    details: [
      "Conference: IEEE CS BDC SYMPOSIUM 2024",
      "Date: November 22-23, 2024",
      "Location: Jagannath University, Dhaka, Bangladesh",
      "Organizer: IEEE Computer Society Bangladesh Chapter",
    ],
  },
}

const certifications = [
  {
    name: "Certified Network Security Practitioner (CNSP)",
    issuer: "The SecOps Group",
    date: "June 2024",
  },
  {
    name: "Certified AppSec Practitioner (CAP)",
    issuer: "The SecOps Group",
    date: "March 2023",
  },
  {
    name: "Jr Penetration Tester",
    issuer: "TryHackMe",
    date: "April 2024",
  },
  {
    name: "GitHub Foundations",
    issuer: "GitHub",
    date: "Oct 2024",
  },
]

const experience = [
  {
    title: "Cyber Security Instructor & Pentester",
    company: "SMP CyberSecurity",
    type: "Contract",
    location: "Dhaka",
    period: "10/2024 - Present",
  },
  {
    title: "Freelancer",
    company: "Upwork",
    type: "Remote",
    location: "Worldwide",
    period: "04/2023 - 09/2023",
    highlights: [
      "Provided Vulnerability Assessment & Penetration Testing",
      "Conducted OSINT investigations",
    ],
  },
  {
    title: "IT Technician",
    company: "ThorTech",
    type: "Part-Time",
    location: "Dhaka",
    period: "07/2021 - 10/2023",
  },
  {
    title: "System Administrator Trainer",
    company: "AsiaInfo Technologies Ltd",
    type: "Contract",
    location: "China",
    period: "03/2024 - 04/2024",
  },
  {
    title: "Cloud Computing Trainee",
    company: "Prime Tech Solutions Ltd.",
    type: "Internship",
    location: "Dhaka",
    period: "09/2023 - 12/2023",
  },
  {
    title: "Cybersecurity Trainee",
    company: "Arena Web Security",
    type: "Internship",
    location: "Dhaka",
    period: "06/2023 - 07/2023",
  },
]

const leadership = [
  {
    title: "Coordinator",
    organization: "ITRRC Cybersecurity Research Lab",
    period: "09/2024 - Present",
  },
  {
    title: "President",
    organization: "Jagannath University IT Society",
    period: "07/2023 - Present",
    description: "Leading 200+ members",
  },
  {
    title: "Vice President",
    organization: "Sherpur District Student Welfare Council",
    period: "2018 - 2021",
  },
]

const education = [
  {
    degree: "MSc in Computer Science & Engineering",
    institution: "Jagannath University",
    location: "Dhaka",
    period: "2022 - 2024",
  },
  {
    degree: "BSc in Computer Science & Engineering",
    institution: "Jagannath University",
    location: "Dhaka",
    period: "2017 - 2021",
  },
]

export default function Resume() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container py-12">
        <div className="mx-auto max-w-5xl">
          
          {/* Header Section with Download */}
          <div className="mb-12">
            <Card className="overflow-hidden border-2">
              <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-background p-8">
                <div className="flex flex-col items-center gap-6 text-center md:flex-row md:justify-between md:text-left">
                  <div className="flex-1">
                    <h1 className="mb-2 text-4xl font-bold tracking-tight md:text-5xl">
                      {personalInfo.name}
                    </h1>
                    <p className="mb-2 text-xl font-semibold text-primary">
                      {personalInfo.title}
                    </p>
                    <p className="mb-4 text-lg text-muted-foreground">
                      {personalInfo.subtitle}
                    </p>
                    
                    {/* Contact Info */}
                    <div className="flex flex-wrap items-center justify-center gap-4 text-sm md:justify-start">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span>{personalInfo.location}</span>
                      </div>
                      <Separator orientation="vertical" className="h-4" />
                      <a href={personalInfo.linkedin} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-primary">
                        <Linkedin className="h-4 w-4" />
                        <span>LinkedIn</span>
                      </a>
                      <Separator orientation="vertical" className="h-4" />
                      <a href={personalInfo.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-primary">
                        <Globe className="h-4 w-4" />
                        <span>Portfolio</span>
                      </a>
                    </div>
                  </div>
                  
                  {/* Download Button */}
                  <div className="flex flex-col gap-3">
                    <Button asChild size="lg" className="gap-2">
                      <a href="/resume.pdf" download="Md_Redwan_Ahmed_Resume.pdf">
                        <Download className="h-5 w-5" />
                        Download PDF
                      </a>
                    </Button>
                    <Button asChild variant="outline" size="lg" className="gap-2">
                      <a href="/resume.pdf" target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-5 w-5" />
                        View PDF
                      </a>
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Career Objective */}
          <Card className="mb-8 border-l-4 border-l-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Briefcase className="h-6 w-6 text-primary" />
                Career Objective
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="leading-relaxed text-muted-foreground">
                As a technology enthusiast with a strong background in Computer Science & Engineering, I am now expanding my horizons to include Cybersecurity and System Administration. I aim to contribute to secure and efficient IT environments while continuously improving my skills. I am particularly passionate about implementing robust security measures and promoting secure coding practices while being driven by the opportunity to constantly acquire new technological knowledge and apply it effectively in dynamic work settings. I am actively seeking a full-time cybersecurity position while also open to freelance projects in penetration testing, security consulting, and system administration.
              </p>
            </CardContent>
          </Card>

          {/* Professional Experience */}
          <Card className="mb-8 border-l-4 border-l-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Briefcase className="h-6 w-6 text-primary" />
                Professional Experience
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {experience.map((job, index) => (
                <div key={index} className="relative pl-6 before:absolute before:left-0 before:top-2 before:h-3 before:w-3 before:rounded-full before:bg-primary">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold">{job.title}</h3>
                      <p className="text-base text-primary">
                        {job.company}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {job.type} · {job.location}
                      </p>
                    </div>
                    <Badge variant="outline" className="w-fit">
                      {job.period}
                    </Badge>
                  </div>
                  {job.highlights && (
                    <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                      {job.highlights.map((highlight, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary/60" />
                          <span>{highlight}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {index < experience.length - 1 && (
                    <Separator className="mt-6" />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Education */}
          <Card className="mb-8 border-l-4 border-l-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <GraduationCap className="h-6 w-6 text-primary" />
                Education
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {education.map((edu, index) => (
                <div key={index}>
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold">{edu.degree}</h3>
                      <p className="text-base text-primary">
                        {edu.institution}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {edu.location}
                      </p>
                    </div>
                    <Badge variant="outline" className="w-fit">
                      {edu.period}
                    </Badge>
                  </div>
                  {index < education.length - 1 && (
                    <Separator className="mt-6" />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Technical Skills */}
          <Card className="mb-8 border-l-4 border-l-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Award className="h-6 w-6 text-primary" />
                Technical Skills
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {Object.entries(technicalSkills).map(([category, skills]) => (
                <div key={category}>
                  <h3 className="mb-3 text-base font-semibold text-primary">{category}</h3>
                  <div className="flex flex-wrap gap-2">
                    {skills.map((skill) => (
                      <Badge key={skill} variant="secondary" className="px-3 py-1">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
              
              {/* Soft Skills */}
              <div className="pt-4">
                <h3 className="mb-3 text-base font-semibold text-primary">Soft Skills</h3>
                <div className="flex flex-wrap gap-2">
                  {softSkills.map((skill) => (
                    <Badge key={skill} variant="outline" className="px-3 py-1">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>
              
              {/* Other Skills */}
              <div className="pt-4">
                <h3 className="mb-3 text-base font-semibold text-primary">Other Skills</h3>
                <div className="flex flex-wrap gap-2">
                  {otherSkills.map((skill) => (
                    <Badge key={skill} variant="outline" className="px-3 py-1">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Certifications */}
          <Card className="mb-8 border-l-4 border-l-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Award className="h-6 w-6 text-primary" />
                Certifications
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {certifications.map((cert, index) => (
                <div key={index} className="rounded-lg border bg-card p-4 transition-colors hover:bg-accent">
                  <h3 className="mb-1 font-semibold">{cert.name}</h3>
                  <p className="text-sm text-muted-foreground">{cert.issuer}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{cert.date}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Research & Publications */}
          <Card className="mb-8 border-l-4 border-l-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <BookOpen className="h-6 w-6 text-primary" />
                Research & Publications
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-lg border bg-card p-6">
                <div className="mb-2 flex items-center gap-2">
                  <Badge variant="default">Journal Paper</Badge>
                  <Badge variant="secondary">Q1 · Scopus</Badge>
                </div>
                <h3 className="mb-3 text-lg font-semibold">{research.journal.title}</h3>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {research.journal.details.map((detail, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary/60" />
                      <span>{detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
              
              <div className="rounded-lg border bg-card p-6">
                <div className="mb-2 flex items-center gap-2">
                  <Badge variant="default">Conference Paper</Badge>
                  <Badge variant="secondary">IEEE</Badge>
                </div>
                <h3 className="mb-3 text-lg font-semibold">{research.conference.title}</h3>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {research.conference.details.map((detail, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary/60" />
                      <span>{detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Leadership Experience */}
          <Card className="mb-8 border-l-4 border-l-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Users className="h-6 w-6 text-primary" />
                Leadership Experience
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {leadership.map((role, index) => (
                <div key={index}>
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold">{role.title}</h3>
                      <p className="text-base text-primary">
                        {role.organization}
                      </p>
                      {role.description && (
                        <p className="text-sm text-muted-foreground">
                          {role.description}
                        </p>
                      )}
                    </div>
                    <Badge variant="outline" className="w-fit">
                      {role.period}
                    </Badge>
                  </div>
                  {index < leadership.length - 1 && (
                    <Separator className="mt-6" />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Hobbies & Interests */}
          <Card className="mb-8 border-l-4 border-l-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Heart className="h-6 w-6 text-primary" />
                Hobbies & Interests
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              {hobbies.map((hobby, index) => (
                <div key={index} className="rounded-lg border bg-card p-4">
                  <h3 className="mb-2 font-semibold">{hobby.name}</h3>
                  <p className="text-sm text-muted-foreground">{hobby.description}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Languages */}
          <Card className="mb-8 border-l-4 border-l-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Globe className="h-6 w-6 text-primary" />
                Languages
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-center justify-between rounded-lg border bg-card p-4">
                  <span className="font-semibold">Bengali</span>
                  <Badge variant="default">Native</Badge>
                </div>
                <div className="flex items-center justify-between rounded-lg border bg-card p-4">
                  <span className="font-semibold">English</span>
                  <Badge variant="default">Fluent</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Footer Actions */}
          <div className="flex flex-wrap justify-center gap-4 pt-8">
            <Button asChild size="lg" className="gap-2">
              <Link href="/contact">
                <Mail className="h-5 w-5" />
                Contact Me
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="gap-2">
              <a href={personalInfo.linkedin} target="_blank" rel="noopener noreferrer">
                <Linkedin className="h-5 w-5" />
                LinkedIn Profile
              </a>
            </Button>
            <Button asChild variant="outline" size="lg" className="gap-2">
              <a href="/resume.pdf" download="Md_Redwan_Ahmed_Resume.pdf">
                <Download className="h-5 w-5" />
                Download Resume
              </a>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}