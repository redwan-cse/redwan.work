import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Download, ExternalLink } from "lucide-react"
import Link from "next/link"

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
    <div className="container py-12">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-12 flex flex-col items-center gap-6 text-center">
          <h1 className="text-4xl font-bold">Professional Resume</h1>
          <p className="max-w-2xl text-lg text-muted-foreground">
            Cybersecurity expert specializing in penetration testing, vulnerability assessments, and security consulting.
          </p>
          <Button asChild>
            <a href="/resume.pdf" download>
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </a>
          </Button>
        </div>

        {/* Career Objective */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Career Objective</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              As a technology enthusiast with a strong background in Computer Science & Engineering, I am now expanding my horizons to include Cybersecurity and System Administration. I aim to contribute to secure and efficient IT environments while continuously improving my skills. I am particularly passionate about implementing robust security measures and promoting secure coding practices while being driven by the opportunity to constantly acquire new technological knowledge and apply it effectively in dynamic work settings. I am actively seeking a full-time cybersecurity position while also open to freelance projects in penetration testing, security consulting, and system administration.
            </p>
          </CardContent>
        </Card>

        {/* Technical Skills */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Technical Skills</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6">
            {Object.entries(technicalSkills).map(([category, skills]) => (
              <div key={category}>
                <h3 className="mb-3 font-semibold">{category}</h3>
                <div className="flex flex-wrap gap-2">
                  {skills.map((skill) => (
                    <Badge key={skill} variant="secondary">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Soft Skills */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Soft Skills</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {softSkills.map((skill) => (
                <Badge key={skill} variant="secondary">
                  {skill}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Other Skills */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Other Skills</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {otherSkills.map((skill) => (
                <Badge key={skill} variant="secondary">
                  {skill}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Experience */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Professional Experience</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6">
            {experience.map((job, index) => (
              <div key={index} className="grid gap-2">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{job.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {job.company} · {job.type} · {job.location}
                    </p>
                  </div>
                  <span className="text-sm text-muted-foreground">{job.period}</span>
                </div>
                {job.highlights && (
                  <ul className="ml-4 list-disc text-sm text-muted-foreground">
                    {job.highlights.map((highlight, i) => (
                      <li key={i}>{highlight}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Leadership */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Leadership Experience</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6">
            {leadership.map((role, index) => (
              <div key={index} className="grid gap-1">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{role.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {role.organization}
                      {role.description && ` · ${role.description}`}
                    </p>
                  </div>
                  <span className="text-sm text-muted-foreground">{role.period}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Education */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Education</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6">
            {education.map((edu, index) => (
              <div key={index} className="grid gap-1">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{edu.degree}</h3>
                    <p className="text-sm text-muted-foreground">
                      {edu.institution} · {edu.location}
                    </p>
                  </div>
                  <span className="text-sm text-muted-foreground">{edu.period}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Research & Publications */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Research & Publications</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6">
            <div>
              <h3 className="mb-3 font-semibold">Journal Paper</h3>
              <h4 className="mb-2 text-lg">{research.journal.title}</h4>
              <ul className="ml-4 list-disc text-sm text-muted-foreground">
                {research.journal.details.map((detail, index) => (
                  <li key={index}>{detail}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-3 font-semibold">Conference Paper</h3>
              <h4 className="mb-2 text-lg">{research.conference.title}</h4>
              <ul className="ml-4 list-disc text-sm text-muted-foreground">
                {research.conference.details.map((detail, index) => (
                  <li key={index}>{detail}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Hobbies & Interests */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Hobbies & Interests</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {hobbies.map((hobby, index) => (
              <div key={index}>
                <h3 className="font-semibold">{hobby.name}</h3>
                <p className="text-sm text-muted-foreground">{hobby.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Certifications */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Certifications</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6">
            {certifications.map((cert, index) => (
              <div key={index} className="grid gap-1">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{cert.name}</h3>
                    <p className="text-sm text-muted-foreground">{cert.issuer}</p>
                  </div>
                  <span className="text-sm text-muted-foreground">{cert.date}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Languages */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Languages</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <span>Bengali</span>
                <span className="text-muted-foreground">Native</span>
              </div>
              <div className="flex items-center justify-between">
                <span>English</span>
                <span className="text-muted-foreground">Fluent</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contact */}
        <div className="flex justify-center gap-4">
          <Button asChild variant="outline">
            <Link href="/contact">
              Contact Me
            </Link>
          </Button>
          <Button asChild variant="outline">
            <a href="https://www.linkedin.com/in/redwancse" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              LinkedIn
            </a>
          </Button>
        </div>
      </div>
    </div>
  )
}