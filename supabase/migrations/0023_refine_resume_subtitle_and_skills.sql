-- 0023_refine_resume_subtitle_and_skills.sql
-- Shortens resume subtitle to a clean single line ending in "Researcher" (alongside the Q1 Scopus Author pill)
-- and aligns technical_skills, soft_skills, and other_skills strictly with earned certifications, courses,
-- academic research, CSE coursework, and verified work experience.

update public.site_settings
set
  subtitle = 'Certified Ethical Hacker (C|EH) · Offensive Security & Full-Stack/Cloud Architect · Researcher',
  technical_skills = '{
    "Cybersecurity & Offensive Security": [
      "Penetration Testing & Ethical Hacking (C|EH)",
      "Vulnerability Assessment & Penetration Testing (VAPT)",
      "Web & Application Security / OWASP Top 10 (CAP)",
      "Network & Protocol Security (CNSP)",
      "Open-Source Intelligence (OSINT)",
      "Active Directory & AD CS Hardening",
      "SOC, Incident Response & Threat Analysis (IBM / Wazuh)"
    ],
    "Security, SIEM & Assessment Tooling": [
      "Burp Suite Pro",
      "OWASP ZAP",
      "Wazuh (SIEM / XDR)",
      "Kali Linux",
      "Nmap",
      "Metasploit",
      "Nessus",
      "OpenVAS",
      "SQLmap",
      "Hydra",
      "Gobuster",
      "WPScan"
    ],
    "Full-Stack, Databases & Programming": [
      "TypeScript / JavaScript",
      "Next.js (App Router) & React",
      "Tailwind CSS & shadcn/ui",
      "Python (Django & Security/ML Scripting)",
      "PostgreSQL & Row Level Security (RLS)",
      "MySQL",
      "C / C++",
      "Java",
      "REST APIs & Zod Validation",
      "Bash & PowerShell Scripting"
    ],
    "Cloud, Linux & DevSecOps": [
      "Linux System & Server Administration (Ubuntu, CentOS)",
      "AWS & DigitalOcean",
      "Nginx & Heroku",
      "Vercel & Edge Runtime",
      "Supabase (Postgres, Auth, Storage)",
      "Cloudflare (R2, Turnstile, WAF & Edge)",
      "Git & GitHub (GitHub Foundations)",
      "CI/CD (GitHub Actions)",
      "Docker & Containerization"
    ],
    "Applied AI, Machine Learning & CS Foundations": [
      "Machine Learning & Clustering (Scikit-Learn)",
      "Feature Engineering & Classification",
      "Data Analysis (Pandas & NumPy)",
      "AI Workflow & LLM Agent Integration",
      "Computer Networks & TCP/IP",
      "Data Structures, Algorithms & OOP",
      "Backup & Disaster Recovery"
    ]
  }'::jsonb,
  soft_skills = array[
    'Analytical Thinking & Problem Solving',
    'Technical Training & Mentorship (CCEP / EDGE)',
    'Executive & Client Communication',
    'Team Leadership & Coordination',
    'Public Speaking & Workshops'
  ],
  other_skills = array[
    'Security & Technical Documentation',
    'Microsoft Office Suite (Word, Excel, PowerPoint)',
    'Google Workspace Administration',
    'Executive Tech Support & Account Recovery'
  ]
where id = 'default';

update public.resume_items
set
  title = 'Assistant Trainer (Linux Server Administration)',
  highlights = array[
    'Trained Bangladesh Telecommunications Company Limited (BTCL) billing staff on CentOS Linux system and server administration.',
    'Covered CentOS system configuration, user management, and service hardening (on behalf of AsiaInfo Innovation Technologies (Nanjing) Co. Ltd).',
    'Credential: Certificate of completion received for the module delivered.'
  ]
where section = 'experience'
  and organization ilike '%AsiaInfo%';
