-- 0021_resume_references_skills_and_header.sql
-- Updates resume hero title/subtitle, modern technical skills matrix, and academic references
-- (replaces Prof. Dr. Uzzal Kumar Acharjee with Dr. Md. Manowarul Islam and stores verified
-- Google Scholar profile URLs rendered strictly as name hyperlinks without visible raw URL text).

update public.site_settings
set
  role_title = 'Founder & CEO, Fast Cyber Defense · CSE Professional',
  subtitle = 'Certified Ethical Hacker (C|EH) · Offensive Security & Full-Stack/Cloud Architect · Q1 IEEE Researcher',
  technical_skills = '{
    "Cybersecurity & Offensive Security": [
      "Penetration Testing & Ethical Hacking (C|EH)",
      "Vulnerability Assessment & Penetration Testing (VAPT)",
      "Active Directory & AD CS Hardening",
      "Open-Source Intelligence (OSINT)",
      "Web, Network & API Security",
      "OWASP Top 10 & Cryptography"
    ],
    "Security, SIEM & Assessment Tooling": [
      "Burp Suite Pro",
      "OWASP ZAP",
      "Wazuh (SIEM / XDR)",
      "Nmap",
      "Nessus",
      "OpenVAS",
      "Metasploit",
      "SQLmap",
      "Hydra",
      "Gobuster",
      "WPScan",
      "Postman (API Security)"
    ],
    "Full-Stack & Programming": [
      "TypeScript / JavaScript",
      "Next.js (App Router) & React",
      "Tailwind CSS & shadcn/ui",
      "Python (FastAPI / Django)",
      "PostgreSQL & Row Level Security (RLS)",
      "C / C++",
      "Java",
      "MySQL",
      "Shell / PowerShell Scripting"
    ],
    "Cloud, Edge & DevOps": [
      "Linux Administration (Ubuntu, Debian, RHEL)",
      "Supabase & Auth Architecture",
      "Cloudflare (R2, Turnstile, WAF & Edge)",
      "Vercel & DigitalOcean",
      "AWS (EC2, IAM) & Azure IAM",
      "Docker & Containerization",
      "CI/CD (GitHub Actions)",
      "Git & Disaster Recovery"
    ],
    "Applied AI & Systems Engineering": [
      "AI Workflow & LLM Agent Integration",
      "Applied Machine Learning & Deep Learning",
      "Network Architecture & Troubleshooting",
      "Digital Forensics & Incident Response",
      "Backup & Business Continuity"
    ]
  }'::jsonb,
  references_list = '[
    {
      "name": "Prof. Dr. Md. Abu Layek",
      "title": "Professor, Department of Computer Science and Engineering",
      "institution": "Jagannath University, Dhaka-1100, Bangladesh",
      "email": "abulayek@yahoo.com",
      "phone": "+880 1841-465733",
      "scholarUrl": "https://scholar.google.com/citations?user=pDEC0p4AAAAJ&hl=en"
    },
    {
      "name": "Dr. Md. Manowarul Islam",
      "title": "Professor, Department of Computer Science and Engineering",
      "institution": "Jagannath University, Dhaka-1100, Bangladesh",
      "email": "manowar@cse.jnu.ac.bd",
      "phone": "+880 1717-816554",
      "scholarUrl": "https://scholar.google.com/citations?user=MBF7Y_4AAAAJ&hl=en"
    }
  ]'::jsonb
where id = 'default';
