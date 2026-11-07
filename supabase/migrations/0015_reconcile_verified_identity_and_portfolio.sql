-- 0015_reconcile_verified_identity_and_portfolio.sql
-- Reconciles public CMS seeds with ground-truth resume credentials, removes unverified C|EH claims,
-- aligns BSc graduation year and academic reference email, and replaces unverified portfolio numbers
-- with verifiable methodology and architecture summaries.

-- 1. Reconcile site_settings ('default')
update public.site_settings
set
  full_name = 'Md. Redwan Ahmed',
  role_title = 'Cybersecurity Specialist, Full-Stack Engineer & Founder of Fast Cyber Defense',
  short_role = 'Security Specialist & Full-Stack Consultant',
  subtitle = 'Offensive Security & VAPT Specialist | Full-Stack & Cloud Consultant | Q1 Scopus & IEEE Researcher | Educator',
  tagline = 'Cybersecurity Specialist (CCEP, CNSP, CAP), Full-Stack Software Engineer, Cloud/DevOps Architect, and Executive Technical Consultant delivering offensive security assessments, custom software, AI pipelines, and rapid incident recovery.',
  executive_summary = 'Computer Science & Engineering professional specializing in offensive security (VAPT & OSINT), full-stack software engineering, Linux/cloud infrastructure, and applied machine learning. Proven track record delivering international penetration testing, digital fraud investigations, incident recovery, and custom web platforms alongside peer-reviewed Q1 Scopus and IEEE research publications.',
  email = 'contact@redwan.work',
  credentials = '[
    {"code": "CCEP", "label": "Certified Cybersecurity Educator Professional"},
    {"code": "GitHub", "label": "GitHub Foundations Certified"},
    {"code": "CNSP", "label": "Certified Network Security Practitioner"},
    {"code": "CAP", "label": "Certified AppSec Practitioner"},
    {"code": "Q1 / IEEE", "label": "Published AI & Security Researcher"}
  ]'::jsonb,
  technical_skills = '{
    "Cybersecurity & Offensive Security": [
      "Penetration Testing & Ethical Hacking",
      "Vulnerability Assessment & Penetration Testing (VAPT)",
      "Open-Source Intelligence (OSINT)",
      "Network & API Security",
      "Cryptography (fundamentals)"
    ],
    "Security & SIEM Tooling": [
      "Burp Suite Pro",
      "OWASP ZAP",
      "Nmap",
      "Nessus",
      "OpenVAS",
      "Metasploit",
      "SQLmap",
      "Hydra",
      "gobuster",
      "wpscan",
      "Postman (API testing)",
      "Wazuh (SIEM / XDR)"
    ],
    "Full-Stack & Programming": [
      "TypeScript / Next.js",
      "Python / Django",
      "C/C++",
      "Java",
      "PHP",
      "C#",
      "PostgreSQL",
      "MySQL",
      "Shell / PowerShell / Batch Scripting"
    ],
    "Cloud, DevOps & Linux": [
      "Linux Administration (Ubuntu, CentOS)",
      "AWS (EC2, IAM)",
      "Azure IAM",
      "DigitalOcean",
      "Docker & Containerization",
      "CI/CD (GitHub Actions, Jenkins)",
      "WAF & Edge Security",
      "Kubernetes (basics)",
      "Git"
    ],
    "Networking & Systems": [
      "Cyber Security & Networking",
      "Networking Protocols & Standards",
      "Network Troubleshooting",
      "Configuration Management",
      "Backup & Disaster Recovery"
    ]
  }'::jsonb,
  references_list = '[
    {"name": "Prof. Dr. Md. Abu Layek", "title": "Professor, Department of Computer Science and Engineering", "institution": "Jagannath University, Dhaka-1100, Bangladesh", "email": "abulayek@yahoo.com", "phone": "+880 1841-465733"},
    {"name": "Prof. Dr. Uzzal Kumar Acharjee", "title": "Professor, Department of Computer Science and Engineering", "institution": "Jagannath University, Dhaka-1100, Bangladesh", "email": "uzzal@cse.jnu.ac.bd", "phone": "+880 1625-099037"}
  ]'::jsonb
where id = 'default';

-- 2. Reconcile resume_items: remove unverified EC-Council C|EH vendor row and align BSc period
delete from public.resume_items
where section = 'vendor_certification'
  and (title ilike '%C|EH%' or title ilike '%Certified Ethical Hacker%');

update public.resume_items
set period = '2021 · CGPA: 3.15/4.00'
where section = 'education'
  and title = 'BSc in Computer Science & Engineering';

-- 3. Reconcile services catalog copy
update public.services
set
  title = 'Penetration Testing & VAPT',
  description = 'Comprehensive manual and automated penetration testing across web applications, REST/GraphQL APIs, and network infrastructure with executive and developer remediation reports plus re-test verification.',
  highlights = array[
    'OWASP & PTES manual exploitation & business-logic testing',
    'Executive summary + developer-ready remediation blueprint',
    'Signed Rules of Engagement (RoE) & NDA protection',
    'Complimentary post-fix verification re-test'
  ]
where slug = 'vapt-penetration-testing';

-- 4. Reconcile portfolio_items with honest scope/methodology summaries and valid service slugs
update public.portfolio_items
set
  headline_metric = 'OWASP API & Multi-Tenant VAPT · Re-Test Verified',
  summary = 'Black-box and grey-box OWASP Top 10 & API Security assessment covering cross-tenant authorization boundaries, session tokens, and SSRF surfaces prior to partner audit.',
  challenge = 'The client needed an independent offensive security assessment across REST API endpoints and an administrative dashboard before onboarding enterprise partners.',
  outcomes = array[
    'Critical and high-risk authorization findings remediated and verified on re-test.',
    'Issued formal Penetration Testing Attestation summary for partner security review.',
    'Delivered actionable developer remediation guidance aligned with CVSS v3.1.'
  ],
  stack = array['OWASP API Top 10', 'PTES VAPT', 'Burp Suite Pro', 'Nmap', 'JWT / OAuth2', 'CVSS v3.1'],
  related_service_slug = 'vapt-penetration-testing'
where code = 'CS-101';

update public.portfolio_items
set
  summary = 'Architected a full-lifecycle client relationship and service commerce platform with proposals, digital RoE sign-off, versioned encrypted deliverables, and multi-currency invoicing.',
  related_service_slug = 'fullstack-web-development'
where code = 'CS-102';

update public.portfolio_items
set
  client_sector = 'E-Commerce & Cloud SaaS Infrastructure',
  headline_metric = 'Centralized Wazuh SIEM · CIS Linux Hardening & Active Response',
  challenge = 'The client operated distributed Ubuntu and Windows workloads across cloud providers without centralized log visibility, facing repeated credential-stuffing and file-tampering risk.',
  outcomes = array[
    'Centralized real-time SSH, web, and file-integrity alerting in a unified Wazuh dashboard.',
    'Enabled automated active-response blocking against repeated brute-force sources.'
  ],
  related_service_slug = 'siem-security-monitoring'
where code = 'CS-103';

update public.portfolio_items
set
  outcomes = array[
    'Contained impersonation exposure through registrar abuse filings and email authentication enforcement.',
    'Delivered a structured forensic timeline and executive OPSEC playbook.'
  ],
  related_service_slug = 'osint-threat-investigation'
where code = 'CS-104';

update public.portfolio_items
set
  headline_metric = 'Published in Q1 Scopus (Elsevier IJCCE) & IEEE CS BDC Symposium',
  summary = 'Peer-reviewed machine learning research and reproducible Python pipelines covering market-segmentation clustering and feature-engineered phishing URL detection.',
  approach = array[
    'Engineered end-to-end preprocessing, feature extraction, and model evaluation across clustering and supervised classification pipelines.',
    'Developed URL lexical and host-based feature pipelines for phishing detection research.',
    'Published peer-reviewed papers in Elsevier International Journal of Cognitive Computing in Engineering (Q1 Scopus) and IEEE CS BDC Symposium 2024.'
  ],
  outcomes = array[
    'Two peer-reviewed publications with DOI/proceedings verification links on the public curriculum vitae.',
    'Reusable Python preprocessing and evaluation modules adaptable to fraud and phishing analytics.'
  ],
  related_service_slug = 'ai-ml-automation'
where code = 'CS-105';

update public.portfolio_items
set
  title = 'Compromised Production Server & Web Platform Recovery',
  headline_metric = 'Forensic Malware Eradication · Clean Rebuild & WAF Hardening',
  outcomes = array[
    'Restored production cleanly from verified backups after persistence removal and secret rotation.',
    'Transitioned environment onto hardened Nginx/WAF rules and scheduled health checks.'
  ],
  related_service_slug = 'executive-tech-support-recovery'
where code = 'CS-106';
