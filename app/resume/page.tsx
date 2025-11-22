"use client"

import { useRef } from "react"
import { useReactToPrint } from "react-to-print"
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
import { Download, ExternalLink, Mail, Phone, MapPin, Linkedin, Github, Globe, Briefcase, GraduationCap, Award, Users, BookOpen, Heart, FileText, Printer } from "lucide-react"
import Link from "next/link"
import { PrintableResume } from "@/components/printable-resume"

const personalInfo = {
  name: "Md. Redwan Ahmed",
  title: "Computer Science & Engineering Professional",
  subtitle: "Cybersecurity Researcher | Information Security Freelancer | Educator",
  email: "contact@redwan.work",
  phone: "+88017-7638-7624",
  location: "Dhaka, BD",
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
    "Security Tools (Burp Suite, Nessus, EnCase, FTK, Autopsy)",
  ],
  "System Administration": [
    "Linux System Administration (CentOS, Ubuntu Server)",
    "Configuration Management (Ansible)",
    "Virtualization & Containerization (Docker, Kubernetes)",
    "Backup & Recovery Solutions",
  ],
  "Cloud & DevOps": [
    "AWS (EC2 Instance, IAM)",
    "Digital Ocean",
    "Azure IAM",
    "CI/CD Pipelines (GitHub Actions, Jenkins)",
    "Git & GitHub",
    "Command-Line Interface (CLI) Proficiency",
    "Jira",
  ],
  "Programming & Scripting": [
    "Python",
    "Java",
    "C/C++",
    "MySQL",
    "PHP",
    "C#",
    "PowerShell Scripting",
    "Shell Scripting",
    "Batch Scripting",
  ],
}

const softSkills = [
  "Analytical Skills",
  "Team Collaboration",
  "Team Management",
  "Leadership",
  "Time Management",
  "Commitment",
  "Communication",
  "Emotional Intelligence",
  "Public Speaking",
]

const otherSkills = [
  "MS Office 365",
  "Google Workspace",
  "Tech Support",
  "Troubleshooting",
  "Self-Learning Capability",
  "Documentation",
]

const hobbies = [
  {
    name: "Cybersecurity Research",
    description: "Actively researching emerging threats, vulnerabilities, and security methodologies to stay ahead in the field.",
  },
  {
    name: "Open Source Contribution",
    description: "Contributing to security tools and frameworks on GitHub, collaborating with the global developer community.",
  },
  {
    name: "Capture The Flag (CTF) Challenges",
    description: "Participating in cybersecurity competitions to sharpen problem-solving skills and explore ethical hacking techniques.",
  },
  {
    name: "Technical Writing & Documentation",
    description: "Creating guides, tutorials, and technical documentation to share knowledge with the security community.",
  },
  {
    name: "Teaching & Mentoring",
    description: "Training aspiring cybersecurity professionals and students, sharing practical knowledge and industry best practices.",
  },
  {
    name: "Technology Exploration",
    description: "Continuously learning new programming languages, frameworks, and security tools to expand technical expertise.",
  },
]

const research = {
  journal: {
    title: "Data-Driven Strategies for Digital Native Market Segmentation Using Clustering",
    url: "https://doi.org/10.1016/j.ijcce.2024.04.002",
    details: [
      "Journal: International Journal of Cognitive Computing in Engineering",
      "Indexing: Scopus (Open Access)",
      "Quartile: Q1",
      "Publisher: Elsevier",
      "Online ISSN: 2666-3074",
    ],
  },
  conference: {
    title: "Phishing URL Detection Using Comprehensive Feature Extraction and Machine Learning Techniques",
    url: "https://s24.ieeecsbdc.org/papers/156",
    details: [
      "Conference: IEEE CS BDC SYMPOSIUM 2024",
      "Date: November 22-23, 2024",
      "Location: Jagannath University, Dhaka, Bangladesh",
    ],
  },
}

// Exam and vendor certifications
const vendorCertifications = [
  {
    name: "Certified Cybersecurity Educator Professional (CCEP)",
    issuer: "Red Team Leaders",
    date: "Nov 2025",
    verificationUrl: "https://courses.redteamleaders.com/exam-completion/8c0a8dde8e93c63e",
  },
  {
    name: "GitHub Foundations",
    issuer: "GitHub",
    date: "Oct 2024",
    verificationUrl: "https://www.credly.com/badges/f98045ea-b50d-4d57-82a0-af7863ca99b3",
  },
  {
    name: "Certified Network Security Practitioner (CNSP)",
    issuer: "The SecOps Group",
    date: "Jun 2024",
    verificationUrl: "https://candidate.speedexam.net/certificate.aspx?SSTATE=am4131EniU8ntjp4bO5mXXavp+YURgGKbVJXOmMyS+V2I8II4rmpHeukqY/dquFBgL7CG9IflgMKW24kDcDENaTU5tQ+NGz8g6ZJkXWlvdU=",
  },
  {
    name: "Certified AppSec Practitioner (CAP)",
    issuer: "The SecOps Group",
    date: "Mar 2023",
    verificationUrl: "https://candidate.speedexam.net/certificate.aspx?SSTATE=am4131EniU8ntjp4bO5mXeivFC8I+nhKTJxcDik4I8GciDzBMMaLBCQtwD6nT3sskY1NsNO4LbFS/u4FEzLyN+iKTamOZcv+Bk3aSG/Ez+I=",
  },
]

// Professional certificates and course completions
const professionalCertificates = [
  {
    name: "Mastering Ethical Hacking Tools",
    issuer: "EC-Council | Learning",
    date: "Nov 2025",
    verificationUrl: "https://learn.eccouncil.org/certificate/30e719db-9782-4f31-89a6-4c491b814e76?logged=true",
  },
  {
    name: "IBM Cybersecurity Analyst (V2)",
    issuer: "Coursera",
    date: "Jul 2025",
    verificationUrl: "https://www.coursera.org/account/accomplishments/specialization/RQLW1C63J7EP",
  },
  {
    name: "Cloud Computing",
    issuer: "ICT Division, Bangladesh",
    date: "Sep 2024",
    verificationUrl: "https://drive.google.com/file/d/1nLkBFU1f4eDN6f19236i4Jk3BXC7MMdc/view?usp=sharing",
  },
  {
    name: "Jr Penetration Tester",
    issuer: "TryHackMe",
    date: "Apr 2024",
    verificationUrl: "https://tryhackme-certificates.s3-eu-west-1.amazonaws.com/THM-1F9FZJ3YIU.png",
  },
  {
    name: "21st Century Employability Skilling Program - Advanced",
    issuer: "Wadhwani Foundation",
    date: "Nov 2023",
    verificationUrl: "https://web.certificate.wfglobal.org/en/certificate?certificateId=655e4528cbe74e70300d680a",
  },
  {
    name: "Cyber Security",
    issuer: "Arena Web Security",
    date: "Jul 2023",
    verificationUrl: "https://admission.arenawebsecurity.net/certificate/apiview/verify/?query=A43W1911S016",
  },
]

const experience = [
  {
    title: "Professional Information Security Freelancer",
    company: "Upwork",
    type: "Remote",
    location: "Worldwide",
    period: "04/2023 - Present",
    highlights: [
      "Leveraged VA/PT tools to conduct vulnerability assessments and penetration tests using Burp Suite and Nessus.",
      "Delivered data recovery and digital security solutions.",
      "Directed forensic investigation using EnCase, FTK, and Autopsy.",
      "Provided technical task management and consultation.",
    ],
  },
  {
    title: "Trainer – Machine Learning with Python",
    company: "EDGE Project, Jagannath University",
    type: "Training",
    location: "Dhaka",
    period: "09/2024 - 05/2025",
    highlights: [
      "Conducted hands-on training on Python-based machine learning concepts.",
      "Guided participants through supervised and unsupervised learning techniques.",
    ],
  },
  {
    title: "Trainer – Basic Computer Course",
    company: "Jagannath University IT Society",
    type: "Training",
    location: "Dhaka",
    period: "08/2024 - 02/2025",
    highlights: [
      "Conducted training on computer fundamentals and MS Office (Word, PowerPoint, Excel).",
      "Focused on practical learning to promote digital literacy.",
    ],
  },
  {
    title: "Trainer – Microsoft Office",
    company: "EDGE Project, Jagannath University",
    type: "Training",
    location: "Dhaka",
    period: "08/2024 - 12/2024",
    highlights: [
      "Conducted practical sessions on Microsoft Office applications including Word, Excel, and PowerPoint.",
      "Delivered foundational IT training as part of the national EDGE capacity-building initiative.",
    ],
  },
  {
    title: "Assistant Trainer",
    company: "AsiaInfo Innovation Technologies (Nanjing) Co. Ltd",
    type: "Contract",
    location: "Dhaka",
    period: "04/2024 - 04/2024",
    highlights: [
      "Trained Bangladesh Telecommunications Company Limited (BTCL) billing staff on Linux system and server administration.",
      "Covered system configuration, user management, and service hardening (on behalf of AsiaInfo Innovation Technologies (Nanjing) Co. Ltd).",
    ],
  },
  {
    title: "Cloud Computing Trainee",
    company: "Prime Tech Solutions Ltd.",
    type: "Internship",
    location: "Dhaka",
    period: "09/2023 - 03/2024",
    highlights: [
      "Gained hands-on experience with Git, GitHub, AWS, Heroku, and Digital Ocean.",
      "Applied skills in web development with Django framework and CI/CD.",
    ],
  },
  {
    title: "Cybersecurity Internship",
    company: "Arena Web Security - The Hacker's Arena",
    type: "Internship",
    location: "Dhaka",
    period: "06/2023 - 07/2023",
    highlights: [
      "Completed comprehensive 5-month Cybersecurity course with 1-month hands-on internship.",
      "Participated in ethical hacking, vulnerability assessments, and penetration testing.",
    ],
  },
]

const leadership = [
  {
    title: "Research Fellow",
    organization: "ITRRC Cybersecurity Research Lab, Jagannath University",
    period: "06/2024 - Present",
    description: "Mentoring cybersecurity research trainees and connecting lab trainees with university professors",
  },
  {
    title: "Former President",
    organization: "Jagannath University IT Society",
    period: "07/2023 - 07/2025",
    description: "Leading 200+ members, coordinating IT-related events and workshops",
  },
  {
    title: "General Member to Vice President",
    organization: "Jagannath University IT Society",
    period: "11/2017 - 07/2023",
    description: "Developed organizational and leadership skills",
  },
  {
    title: "Former Vice-President",
    organization: "Sherpur District Student Welfare Council, Jagannath University",
    period: "01/2018 - 11/2021",
    description: "Co-founded student welfare council to address educational and social needs",
  },
]

const education = [
  {
    degree: "MSc in Computer Science & Engineering",
    institution: "Jagannath University",
    location: "Dhaka, Bangladesh",
    period: "Ongoing",
  },
  {
    degree: "BSc in Computer Science & Engineering",
    institution: "Jagannath University",
    location: "Dhaka, Bangladesh",
    period: "2020",
  },
  {
    degree: "Higher Secondary Certificate",
    institution: "Cambrian College",
    location: "Dhaka, Bangladesh",
    period: "2016",
  },
  {
    degree: "Secondary School Certificate",
    institution: "Sonkanda Dr. M. T Hossain High School",
    location: "Sherpur, Bangladesh",
    period: "2014",
  },
]

const summary = "Early-career Computer Science & Engineering professional developing practical skills in information security, cyber defense, and system administration, with growing experience as a freelancer and trainer. I am actively building my expertise through hands-on security work, teaching activities, and continuous self-learning, with a focus on applying Machine Learning and Artificial Intelligence to real-world security problems. I'm particularly interested in roles and environments that allow me to strengthen my technical foundations, contribute to secure system design, support others through mentoring and training, and gradually transition into more advanced responsibilities in both the information security industry and research."

const researchInterests = [
  "Cyber Security",
  "Machine Learning",
  "Artificial Intelligence",
]

const references = [
  {
    name: "Prof. Dr. Md. Abu Layek",
    title: "Professor, Department of Computer Science and Engineering",
    institution: "Jagannath University, Dhaka-1100, Bangladesh",
    email: "layek@cse.jnu.ac.bd",
    phone: "+880 1841-465733",
  },
  {
    name: "Prof. Dr. Uzzal Kumar Acharjee",
    title: "Professor, Department of Computer Science and Engineering",
    institution: "Jagannath University, Dhaka-1100, Bangladesh",
    email: "uzzal@cse.jnu.ac.bd",
    phone: "+880 1625-099037",
  },
]

export default function Resume() {
  const printRef = useRef<HTMLDivElement>(null)
  
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: "Md_Redwan_Ahmed_Resume",
    pageStyle: `
      @page {
        size: A4;
        margin: 0;
      }
      @media print {
        body {
          margin: 0 !important;
          padding: 0 !important;
        }
        html, body {
          height: 100%;
          overflow: visible;
        }
        @page { size: A4; margin: 0; }
      }
    `,
  })

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Hidden printable version */}
      <div className="hidden">
        <PrintableResume
          ref={printRef}
          personalInfo={personalInfo}
          summary={summary}
          researchInterests={researchInterests}
          technicalSkills={technicalSkills}
          softSkills={softSkills}
          otherSkills={otherSkills}
          experience={experience}
          education={education}
          vendorCertifications={vendorCertifications}
          professionalCertificates={professionalCertificates}
          research={research}
          leadership={leadership}
          hobbies={hobbies}
          references={references}
        />
      </div>

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
                      <a href={`mailto:${personalInfo.email}`} className="flex items-center gap-2 hover:text-primary">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span>{personalInfo.email}</span>
                      </a>
                      <Separator orientation="vertical" className="h-4" />
                      <a href={`tel:${personalInfo.phone.replace(/[^+\d]/g, '')}`} className="flex items-center gap-2 hover:text-primary">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span>{personalInfo.phone}</span>
                      </a>
                      <Separator orientation="vertical" className="h-4" />
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
                      <a href={personalInfo.github} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-primary">
                        <Github className="h-4 w-4" />
                        <span>GitHub</span>
                      </a>
                    </div>
                  </div>
                  
                  {/* Download Buttons */}
                  <div className="flex flex-col gap-3">
                    <Button onClick={handlePrint} size="lg" className="gap-2">
                      <Printer className="h-5 w-5" />
                      Generate PDF
                    </Button>
                    <Button asChild variant="outline" size="lg" className="gap-2">
                      <a href="/resume.pdf" download="Md_Redwan_Ahmed_Resume.pdf">
                        <Download className="h-5 w-5" />
                        Download Existing
                      </a>
                    </Button>
                    <Button asChild variant="outline" size="lg" className="gap-2">
                      <a href="/resume.pdf" target="_blank" rel="noopener noreferrer">
                        <FileText className="h-5 w-5" />
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
                Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="leading-relaxed text-muted-foreground">
                {summary}
              </p>
            </CardContent>
          </Card>

          {/* Research Interests */}
          <Card className="mb-8 border-l-4 border-l-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <BookOpen className="h-6 w-6 text-primary" />
                Research Interests
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {researchInterests.map((interest) => (
                  <Badge key={interest} variant="secondary" className="px-3 py-1.5 text-sm">
                    {interest}
                  </Badge>
                ))}
              </div>
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

          {/* Certifications (Exam/Vendor) */}
          <Card className="mb-8 border-l-4 border-l-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Award className="h-6 w-6 text-primary" />
                Certifications
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {vendorCertifications.map((cert, index) => (
                <div key={index} className="rounded-lg border bg-card p-4 transition-colors hover:bg-accent">
                  {cert.verificationUrl ? (
                    <Link 
                      href={cert.verificationUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="group"
                    >
                      <h3 className="mb-1 font-semibold group-hover:text-primary flex items-center gap-2">
                        {cert.name}
                        <ExternalLink className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </h3>
                    </Link>
                  ) : (
                    <h3 className="mb-1 font-semibold">{cert.name}</h3>
                  )}
                  <p className="text-sm text-muted-foreground">{cert.issuer}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{cert.date}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Professional Certificates & Course Completions */}
          <Card className="mb-8 border-l-4 border-l-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Award className="h-6 w-6 text-primary" />
                Professional Certificates & Course Completions
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {professionalCertificates.map((cert, index) => (
                <div key={index} className="rounded-lg border bg-card p-4 transition-colors hover:bg-accent">
                  {cert.verificationUrl ? (
                    <Link 
                      href={cert.verificationUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="group"
                    >
                      <h3 className="mb-1 font-semibold group-hover:text-primary flex items-center gap-2">
                        {cert.name}
                        <ExternalLink className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </h3>
                    </Link>
                  ) : (
                    <h3 className="mb-1 font-semibold">{cert.name}</h3>
                  )}
                  <p className="text-sm text-muted-foreground">{cert.issuer}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{cert.date}</p>
                </div>
              ))}
              <div className="rounded-lg border bg-card p-4 transition-colors hover:bg-accent col-span-full">
                <Link 
                  href="https://drive.google.com/drive/folders/1JZvV08biy77fcW0_R9BJQEvBZuPH4ZVj?usp=sharing" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="group flex items-center gap-2 text-primary hover:underline"
                >
                  <ExternalLink className="h-4 w-4" />
                  <span className="font-semibold">View full list of course certificates</span>
                  <ExternalLink className="h-4 w-4 opacity-0" />
                </Link>
              </div>
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
                <Link 
                  href={research.journal.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="group"
                >
                  <h3 className="mb-3 text-lg font-semibold group-hover:text-primary flex items-center gap-2">
                    {research.journal.title}
                    <ExternalLink className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </h3>
                </Link>
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
                <Link 
                  href={research.conference.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="group"
                >
                  <h3 className="mb-3 text-lg font-semibold group-hover:text-primary flex items-center gap-2">
                    {research.conference.title}
                    <ExternalLink className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </h3>
                </Link>
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

          {/* Hobbies & Interests */}
          <Card className="mb-8 border-l-4 border-l-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Heart className="h-6 w-6 text-primary" />
                Hobbies & Interests
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {hobbies.map((hobby, index) => (
                <div key={index} className="rounded-lg border bg-card p-4">
                  <h3 className="mb-2 font-semibold">{hobby.name}</h3>
                  <p className="text-sm text-muted-foreground">{hobby.description}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Footer Actions */}
          <div className="flex flex-wrap justify-center gap-4 pt-8">
            <Button onClick={handlePrint} size="lg" className="gap-2">
              <Printer className="h-5 w-5" />
              Generate PDF
            </Button>
            <Button asChild variant="outline" size="lg" className="gap-2">
              <Link href="/contact">
                <Mail className="h-5 w-5" />
                Contact Me
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}