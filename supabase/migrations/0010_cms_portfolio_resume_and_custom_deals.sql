-- 0010_cms_portfolio_resume_and_custom_deals.sql
-- Dynamic CMS tables for Services/Packages, Portfolio Case Studies, Resume/Profile, Custom Deals & Realtime Contract Chat

-- 1. Enrich services & service_packages for full dynamic CMS control
alter table public.services
  add column if not exists highlights text[] not null default '{}',
  add column if not exists starting_price_cents int not null default 0,
  add column if not exists delivery_days_min int not null default 3,
  add column if not exists delivery_days_max int not null default 14;

alter table public.service_packages
  add column if not exists package_name text not null default '',
  add column if not exists is_popular boolean not null default false;

-- 2. Custom Deal columns on orders & inquiries
alter table public.orders
  add column if not exists is_custom_deal boolean not null default false,
  add column if not exists proposed_budget_cents int,
  add column if not exists proposed_delivery_days int;

alter table public.inquiries
  add column if not exists is_custom_deal boolean not null default false,
  add column if not exists proposed_budget_cents int,
  add column if not exists proposed_delivery_days int,
  add column if not exists selected_service_slug text,
  add column if not exists selected_package_tier text;

-- 3. Portfolio Case Studies CMS Table
create table if not exists public.portfolio_items (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  pillar public.service_pillar not null default 'cybersecurity',
  pillar_label text not null default 'Cybersecurity & Offensive Security',
  title text not null,
  client_sector text not null,
  year text not null default '2025',
  headline_metric text not null,
  summary text not null,
  challenge text not null,
  approach text[] not null default '{}',
  outcomes text[] not null default '{}',
  stack text[] not null default '{}',
  related_service_slug text,
  external_url text,
  is_published boolean not null default true,
  is_featured boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portfolio_items_pillar_sort_idx
  on public.portfolio_items (pillar, sort_order);

create trigger portfolio_items_set_updated_at
  before update on public.portfolio_items
  for each row execute function public.set_updated_at();

alter table public.portfolio_items enable row level security;

create policy "portfolio_items_public_read"
  on public.portfolio_items for select
  using (is_published is true or public.is_admin());

create policy "portfolio_items_admin_all"
  on public.portfolio_items for all
  using (public.is_admin())
  with check (public.is_admin());

-- 4. Site Settings & Profile CMS Table (Singleton 'default')
create table if not exists public.site_settings (
  id text primary key default 'default' check (id = 'default'),
  full_name text not null default 'Md. Redwan Ahmed',
  role_title text not null default 'C|EH Certified Cybersecurity Specialist & CSE Professional',
  short_role text not null default 'C|EH Security Specialist & Full-Stack Consultant',
  subtitle text not null default 'Certified Ethical Hacker (C|EH) | Full-Stack & Cloud Consultant | Q1 Scopus & IEEE Researcher | Educator',
  tagline text not null default 'C|EH Certified Ethical Hacker, Full-Stack Software Engineer, Cloud/DevOps Architect, and Executive Technical Consultant delivering high-stakes offensive security, custom software, AI pipelines, and rapid incident recovery.',
  executive_summary text not null default 'C|EH Certified Computer Science & Engineering professional specializing in offensive security, full-stack software engineering, Linux/cloud infrastructure, and applied machine learning. Proven track record delivering international penetration testing, OSINT investigations, incident recovery, and custom web platforms alongside peer-reviewed Q1 Scopus and IEEE research publications.',
  email text not null default 'contact@redwan.work',
  phone text not null default '+88017-7638-7624',
  whatsapp_number text not null default '8801776387624',
  location text not null default 'Dhaka, BD',
  cal_com_url text not null default 'https://cal.com/redwancse',
  company_name text not null default 'Fast Cyber Defense',
  company_url text not null default 'https://fastcyberdefense.com',
  linkedin_url text not null default 'https://www.linkedin.com/in/redwancse',
  github_url text not null default 'https://github.com/redwan-cse',
  website_url text not null default 'https://redwan.work',
  resume_pdf_url text not null default '/resume.pdf',
  credentials jsonb not null default '[]'::jsonb,
  research_interests text[] not null default '{}',
  technical_skills jsonb not null default '{}'::jsonb,
  soft_skills text[] not null default '{}',
  other_skills text[] not null default '{}',
  hobbies jsonb not null default '[]'::jsonb,
  references_list jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create trigger site_settings_set_updated_at
  before update on public.site_settings
  for each row execute function public.set_updated_at();

alter table public.site_settings enable row level security;

create policy "site_settings_public_read"
  on public.site_settings for select
  using (true);

create policy "site_settings_admin_all"
  on public.site_settings for all
  using (public.is_admin())
  with check (public.is_admin());

-- 5. Structured Resume Items CMS Table
create table if not exists public.resume_items (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in (
    'experience',
    'leadership',
    'education',
    'vendor_certification',
    'professional_certificate',
    'research'
  )),
  title text not null,
  organization text not null default '',
  role_type text,
  location text,
  period text,
  description text,
  highlights text[] not null default '{}',
  verification_url text,
  badge_label text,
  sort_order int not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists resume_items_section_sort_idx
  on public.resume_items (section, sort_order);

create trigger resume_items_set_updated_at
  before update on public.resume_items
  for each row execute function public.set_updated_at();

alter table public.resume_items enable row level security;

create policy "resume_items_public_read"
  on public.resume_items for select
  using (is_visible is true or public.is_admin());

create policy "resume_items_admin_all"
  on public.resume_items for all
  using (public.is_admin())
  with check (public.is_admin());

-- 6. Enable Realtime on order_messages for live contract chat
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'order_messages'
  ) then
    alter publication supabase_realtime add table public.order_messages;
  end if;
exception when others then
  null;
end;
$$;

-- 7. Seed / Sync Services & Tiered Packages with Rich Highlights & Popular Flags
do $$
begin
  -- Update existing seeded services with highlights & delivery ranges
  update public.services
  set
    starting_price_cents = 45000,
    delivery_days_min = 5,
    delivery_days_max = 14,
    highlights = array[
      'C|EH Certified manual exploitation & business-logic testing',
      'Executive summary + developer-ready remediation blueprint',
      'Signed Rules of Engagement (RoE) & NDA protection',
      'Complimentary post-fix verification re-test'
    ]
  where slug = 'vapt-penetration-testing';

  update public.services
  set
    starting_price_cents = 30000,
    delivery_days_min = 3,
    delivery_days_max = 10,
    highlights = array[
      'Domain, infrastructure, dark-web & identity attribution',
      'Phishing & brand impersonation takedown intelligence',
      'Chain-of-custody evidence dossier in Encrypted Deliverables Vault'
    ]
  where slug = 'osint-threat-investigation';

  update public.services
  set
    starting_price_cents = 50000,
    delivery_days_min = 4,
    delivery_days_max = 12,
    is_featured = true,
    highlights = array[
      'Production Wazuh Server + Indexer + Dashboard deployment',
      'Custom decoders, MITRE ATT&CK rules & active response',
      'Endpoint agent enrollment & CIS benchmark compliance'
    ]
  where slug = 'siem-security-monitoring';

  update public.services
  set
    starting_price_cents = 60000,
    delivery_days_min = 5,
    delivery_days_max = 21,
    highlights = array[
      'Next.js App Router, React 19, TypeScript & Tailwind CSS v4',
      'PostgreSQL with Row-Level Security (RLS) or Python/Django',
      'Encrypted Vault storage, transactional email workflows & multi-currency billing',
      'Security-hardened authentication & audit logging out of the box'
    ]
  where slug = 'fullstack-web-development';

  update public.services
  set
    starting_price_cents = 25000,
    delivery_days_min = 2,
    delivery_days_max = 10,
    is_featured = true,
    highlights = array[
      'Root-cause diagnosis & clean TypeScript/Python/Node fixes',
      'REST/Webhook API architecture, rate limiting & auth hardening',
      'Automated tests & zero-downtime pull request delivery'
    ]
  where slug = 'api-backend-engineering';

  update public.services
  set
    starting_price_cents = 30000,
    delivery_days_min = 2,
    delivery_days_max = 10,
    highlights = array[
      'CIS-aligned Linux server hardening (SSH, UFW/nftables, Fail2ban)',
      'AWS / Azure / DigitalOcean architecture & cost optimization',
      'Docker Compose, reverse proxies, SSL/TLS & WAF tuning'
    ]
  where slug = 'cloud-linux-devops';

  update public.services
  set
    starting_price_cents = 65000,
    delivery_days_min = 5,
    delivery_days_max = 18,
    highlights = array[
      'LLM RAG pipelines, structured extraction & agent workflows',
      'Custom Python scikit-learn / PyTorch classification & anomaly models',
      'API deployment with strict rate-limiting & prompt-injection guardrails'
    ]
  where slug = 'ai-ml-automation';

  update public.services
  set
    starting_price_cents = 20000,
    delivery_days_min = 1,
    delivery_days_max = 5,
    highlights = array[
      'Same-day triage for compromised websites, servers & cloud accounts',
      'Malware/backdoor removal, root-cause analysis & persistence cleanup',
      'Email deliverability (SPF/DKIM/DMARC), DNS, SSL & cloud data recovery',
      'Confidential 1-on-1 remote engineering & OPSEC support'
    ]
  where slug = 'executive-tech-support-recovery';

  -- Set package_name and is_popular on service_packages
  update public.service_packages
  set
    package_name = case
      when tier_name = 'Starter' then 'Starter Package'
      when tier_name = 'Standard' then 'Standard Recommended Package'
      when tier_name = 'Enterprise' then 'Enterprise Complete Suite'
      else tier_name
    end,
    is_popular = (tier_name = 'Standard')
  where package_name = '';
end;
$$;

-- 8. Seed Portfolio Case Studies (if not already present)
insert into public.portfolio_items (
  code, slug, pillar, pillar_label, title, client_sector, year, headline_metric,
  summary, challenge, approach, outcomes, stack, related_service_slug, external_url,
  is_published, is_featured, sort_order
)
values
  (
    'CS-101',
    'vapt-fintech-api',
    'cybersecurity',
    'Cybersecurity & Offensive Security',
    'Multi-Tenant FinTech Web & REST API Penetration Test',
    'Financial Technology · North America',
    '2025',
    '14 Critical/High Vulnerabilities Remediated · 100% Re-Test Pass',
    'Full-scope black-box and grey-box OWASP Top 10 & API Security assessment uncovering cross-tenant IDOR, JWT key confusion, and SSRF vulnerabilities prior to Series A audit.',
    'The client needed an independent C|EH-led offensive security audit across 45+ REST endpoints and an administrative dashboard before onboarding enterprise banking partners.',
    array[
      'Executed signed Rules of Engagement (RoE) and threat-modeled multi-tenant isolation boundaries.',
      'Performed manual authorization matrix testing in Burp Suite Pro, discovering horizontal privilege escalation in settlement export routes.',
      'Delivered reproducible PoC scripts, CVSS v3.1 scoring, and a developer patch workshop.'
    ],
    array[
      'All 14 Critical and High findings patched and verified within 9 business days.',
      'Issued formal Penetration Testing Attestation Letter for enterprise security questionnaires.',
      'Zero security incidents in production post-launch.'
    ],
    array['C|EH VAPT', 'OWASP API Top 10', 'Burp Suite Pro', 'Nmap', 'JWT / OAuth2', 'CVSS v3.1'],
    'vapt-penetration-testing',
    null,
    true,
    true,
    10
  ),
  (
    'CS-102',
    'enterprise-client-crm-portal',
    'development',
    'Full-Stack Web & Custom Software',
    'Production Client CRM, Order & Encrypted Deliverables Vault Platform',
    'B2B Consulting & Digital Commerce',
    '2026',
    'Next.js 16 · Row-Level Security · Atomic Financial Ledger',
    'Architected a full-lifecycle client relationship and service commerce platform with proposals, C|EH RoE sign-off, versioned encrypted deliverables, and multi-currency invoicing.',
    'Traditional freelance workflows fragment communication, files, and invoices across disconnected tools. The goal was a single, high-trust portal for taking orders, delivering files, and retaining clients.',
    array[
      'Designed a 30+ table relational schema with strict Row-Level Security (RLS) and atomic stored procedures.',
      'Integrated an Encrypted Deliverables Vault with SHA-256 checksums and audit-logged presigned downloads.',
      'Built an Antigravity-inspired Tailwind CSS v4 + Motion interface with dark/light theme support.'
    ],
    array[
      'Unified inquiry -> proposal -> order -> encrypted delivery -> invoice -> retainer pipeline.',
      '100% immutable audit trail across every payment review and deliverable sign-off.'
    ],
    array['Next.js 16', 'TypeScript', 'Tailwind CSS v4', 'PostgreSQL RLS', 'Encrypted Vault', 'Motion'],
    'fullstack-web-development',
    null,
    true,
    true,
    20
  ),
  (
    'CS-103',
    'wazuh-siem-soc',
    'cloud_devops',
    'Cloud, DevOps & Linux Infrastructure',
    'Wazuh SIEM/XDR SOC Architecture & Linux Fleet Hardening',
    'E-Commerce & Cloud SaaS Fleet (35+ Servers)',
    '2025',
    'Sub-15s Threat Detection · 94% Brute-Force & Bot Drop',
    'Centralized Wazuh SIEM deployment with custom MITRE ATT&CK detection rules, File Integrity Monitoring (FIM), CIS Linux hardening, and automated active-response IP blocking.',
    'The client operated 35+ Ubuntu and Windows servers across AWS and DigitalOcean without centralized log visibility, suffering repeated credential-stuffing and unauthorized file tampering attempts.',
    array[
      'Provisioned a hardened Wazuh Server, Indexer, and Dashboard cluster with TLS mutual authentication.',
      'Authored custom XML decoders and rules mapped to MITRE ATT&CK techniques for SSH, Nginx, and web application logs.',
      'Applied CIS Level-2 hardening across all Linux hosts (SSH key-only auth, UFW/nftables, Fail2ban, kernel sysctl tuning).'
    ],
    array[
      'Mean time to detect (MTTD) suspicious privilege escalation reduced from days to under 15 seconds.',
      'Automated active response blocked 12,000+ malicious IPs in the first 30 days.'
    ],
    array['Wazuh SIEM', 'Ubuntu / Debian', 'MITRE ATT&CK', 'Docker', 'WAF', 'CIS Benchmarks'],
    'siem-security-monitoring',
    null,
    true,
    true,
    30
  ),
  (
    'CS-104',
    'osint-bec-fraud',
    'cybersecurity',
    'Cybersecurity & Offensive Security',
    'Executive OSINT & Business Email Compromise (BEC) Investigation',
    'Cross-Border Trade & Legal Advisory',
    '2025',
    'Lookalike Infrastructure Takedown · Full Forensic Attribution',
    'Traced a sophisticated invoice-redirection and domain-impersonation campaign targeting executive wire transfers, compiling an evidentiary dossier and executing rapid email/DNS lock-down.',
    'Threat actors registered typosquatted domains and intercepted vendor threads to divert a six-figure wire transfer.',
    array[
      'Conducted passive DNS, TLS certificate transparency, and header-hop forensic analysis to map attacker infrastructure.',
      'Enforced strict SPF, DKIM, and DMARC p=reject policies alongside conditional access MFA rules.',
      'Submitted abuse evidence packages to registrars and hosting providers to neutralize lookalike domains.'
    ],
    array[
      'Prevented fraudulent wire disbursement and neutralized 4 impersonation domains within 48 hours.',
      'Delivered a board-ready forensic timeline and executive OPSEC playbook.'
    ],
    array['OSINT', 'Email Forensics', 'DMARC / DKIM / SPF', 'Threat Intelligence', 'Maltego'],
    'osint-threat-investigation',
    null,
    true,
    true,
    40
  ),
  (
    'CS-105',
    'q1-ml-healthcare-security',
    'ai_ml',
    'Applied AI/ML & Automation',
    'Published Q1 Scopus & IEEE Machine Learning Pipelines',
    'Academic & Applied AI Research',
    '2024–2025',
    'Published in Q1 Scopus (Elsevier) & IEEE Symposium',
    'Peer-reviewed machine learning research and production inference pipelines combining clustering, phishing URL detection, feature engineering, and explainable AI.',
    'High-stakes predictive models require not only strong accuracy and ROC-AUC but transparent feature attribution that domain experts can audit and trust.',
    array[
      'Engineered end-to-end preprocessing, feature extraction, and hyperparameter optimization across supervised and clustering architectures.',
      'Developed comprehensive URL and behavioral feature pipelines for high-accuracy phishing detection.',
      'Published peer-reviewed findings in Elsevier Q1 Scopus and IEEE conferences.'
    ],
    array[
      'Multiple peer-reviewed publications validating methodology and reproducibility.',
      'Reusable Python inference modules adaptable to fraud, phishing, and market segmentation.'
    ],
    array['Python', 'Scikit-Learn', 'XGBoost', 'Feature Engineering', 'Pandas', 'IEEE / Elsevier Q1'],
    'ai-ml-automation',
    '/resume#research',
    true,
    true,
    50
  ),
  (
    'CS-106',
    'emergency-breach-recovery',
    'tech_support',
    'Executive Tech Support & Digital Recovery',
    '24-Hour Compromised Production Server & Web Platform Recovery',
    'High-Traffic Media & E-Commerce',
    '2025',
    'Full Eradication & Clean Restore in < 6 Hours · Zero Data Loss',
    'Emergency containment, rootkit/webshell removal, database rescue, and WAF shielding for a compromised Linux production server.',
    'An unpatched plugin and exposed credential allowed attackers to inject obfuscated PHP/JS malware and cron persistence, taking checkout offline.',
    array[
      'Isolated the host, captured forensic snapshots, and identified all modified binaries and rogue cron/systemd units.',
      'Rebuilt the application runtime on a clean hardened Ubuntu instance, rotated all secrets, and configured strict WAF rules.',
      'Submitted clean verification for search engine security delisting.'
    ],
    array[
      'Production restored cleanly in under 6 hours with zero customer data loss.',
      'Client transitioned onto an ongoing monthly security & engineering retainer.'
    ],
    array['Incident Response', 'Linux Forensics', 'Malware Removal', 'WAF Hardening', 'Nginx'],
    'executive-tech-support-recovery',
    null,
    true,
    true,
    60
  )
on conflict (code) do nothing;

-- 9. Seed Site Settings & Resume Profile
insert into public.site_settings (
  id, full_name, role_title, short_role, subtitle, tagline, executive_summary,
  email, phone, whatsapp_number, location, cal_com_url, company_name, company_url,
  linkedin_url, github_url, website_url, resume_pdf_url,
  credentials, research_interests, technical_skills, soft_skills, other_skills, hobbies, references_list
)
values (
  'default',
  'Md. Redwan Ahmed',
  'C|EH Certified Cybersecurity Specialist & CSE Professional',
  'C|EH Security Specialist & Full-Stack Consultant',
  'Certified Ethical Hacker (C|EH) | Full-Stack & Cloud Consultant | Q1 Scopus & IEEE Researcher | Educator',
  'C|EH Certified Ethical Hacker, Full-Stack Software Engineer, Cloud/DevOps Architect, and Executive Technical Consultant delivering high-stakes offensive security, custom software, AI pipelines, and rapid incident recovery.',
  'C|EH Certified Computer Science & Engineering professional specializing in offensive security, full-stack software engineering, Linux/cloud infrastructure, and applied machine learning. Proven track record delivering international penetration testing, OSINT investigations, incident recovery, and custom web platforms alongside peer-reviewed Q1 Scopus and IEEE research publications.',
  'contact@redwan.work',
  '+88017-7638-7624',
  '8801776387624',
  'Dhaka, BD',
  'https://cal.com/redwancse',
  'Fast Cyber Defense',
  'https://fastcyberdefense.com',
  'https://www.linkedin.com/in/redwancse',
  'https://github.com/redwan-cse',
  'https://redwan.work',
  '/resume.pdf',
  '[
    {"code": "C|EH", "label": "Certified Ethical Hacker (EC-Council)"},
    {"code": "CCEP", "label": "Certified Cybersecurity Educator Professional"},
    {"code": "CNSP", "label": "Certified Network Security Practitioner"},
    {"code": "CAP", "label": "Certified AppSec Practitioner"},
    {"code": "Q1 / IEEE", "label": "Published AI & Security Researcher"}
  ]'::jsonb,
  array[
    'Cyber Security & Threat Intelligence',
    'Applied Machine Learning',
    'Explainable Artificial Intelligence (XAI)',
    'Cloud & Network Defense'
  ],
  '{
    "Cybersecurity & Offensive Security": [
      "Ethical Hacking (C|EH)",
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
  array[
    'Analytical Thinking',
    'Executive Communication',
    'Team Collaboration & Leadership',
    'Public Speaking & Technical Training'
  ],
  array[
    'Technical & Security Documentation',
    'MS Office 365',
    'Google Workspace',
    'Executive Tech Support & Incident Recovery'
  ],
  '[
    {"name": "Cybersecurity Research", "description": "Actively researching emerging threats, vulnerabilities, and security methodologies to stay ahead in the field."},
    {"name": "Open Source Contribution", "description": "Contributing to security tools and frameworks on GitHub, collaborating with the global developer community."},
    {"name": "Capture The Flag (CTF) Challenges", "description": "Participating in cybersecurity competitions to sharpen problem-solving skills and explore ethical hacking techniques."},
    {"name": "Technical Writing & Documentation", "description": "Creating guides, tutorials, and technical documentation to share knowledge with the security community."},
    {"name": "Teaching & Mentoring", "description": "Training aspiring cybersecurity professionals and students, sharing practical knowledge and industry best practices."},
    {"name": "Technology Exploration", "description": "Continuously learning new programming languages, frameworks, and security tools to expand technical expertise."}
  ]'::jsonb,
  '[
    {"name": "Prof. Dr. Md. Abu Layek", "title": "Professor, Department of Computer Science and Engineering", "institution": "Jagannath University, Dhaka-1100, Bangladesh", "email": "layek@cse.jnu.ac.bd", "phone": "+880 1841-465733"},
    {"name": "Prof. Dr. Uzzal Kumar Acharjee", "title": "Professor, Department of Computer Science and Engineering", "institution": "Jagannath University, Dhaka-1100, Bangladesh", "email": "uzzal@cse.jnu.ac.bd", "phone": "+880 1625-099037"}
  ]'::jsonb
)
on conflict (id) do nothing;

-- 10. Seed Structured Resume Items (if table is empty)
do $$
begin
  if not exists (select 1 from public.resume_items limit 1) then
    -- Vendor Certifications
    insert into public.resume_items (section, title, organization, period, verification_url, sort_order)
    values
      ('vendor_certification', 'Certified Ethical Hacker (C|EH)', 'EC-Council', 'Active Credential', 'https://www.eccouncil.org/', 10),
      ('vendor_certification', 'Certified Cybersecurity Educator Professional (CCEP)', 'Red Team Leaders', 'Nov 2025', 'https://courses.redteamleaders.com/exam-completion/8c0a8dde8e93c63e', 20),
      ('vendor_certification', 'GitHub Foundations', 'GitHub', 'Oct 2024', 'https://www.credly.com/badges/f98045ea-b50d-4d57-82a0-af7863ca99b3', 30),
      ('vendor_certification', 'Certified Network Security Practitioner (CNSP)', 'The SecOps Group', 'Jun 2024', 'https://candidate.speedexam.net/certificate.aspx?SSTATE=am4131EniU8ntjp4bO5mXXavp+YURgGKbVJXOmMyS+V2I8II4rmpHeukqY/dquFBgL7CG9IflgMKW24kDcDENaTU5tQ+NGz8g6ZJkXWlvdU=', 40),
      ('vendor_certification', 'Certified AppSec Practitioner (CAP)', 'The SecOps Group', 'Mar 2023', 'https://candidate.speedexam.net/certificate.aspx?SSTATE=am4131EniU8ntjp4bO5mXeivFC8I+nhKTJxcDik4I8GciDzBMMaLBCQtwD6nT3sskY1NsNO4LbFS/u4FEzLyN+iKTamOZcv+Bk3aSG/Ez+I=', 50);

    -- Professional Certificates
    insert into public.resume_items (section, title, organization, period, verification_url, sort_order)
    values
      ('professional_certificate', 'Mastering Ethical Hacking Tools', 'EC-Council | Learning', 'Nov 2025', 'https://learn.eccouncil.org/certificate/30e719db-9782-4f31-89a6-4c491b814e76?logged=true', 10),
      ('professional_certificate', 'IBM Cybersecurity Analyst (V2)', 'Coursera', 'Jul 2025', 'https://www.coursera.org/account/accomplishments/specialization/RQLW1C63J7EP', 20),
      ('professional_certificate', 'Cloud Computing', 'ICT Division, Bangladesh', 'Sep 2024', 'https://drive.google.com/file/d/1nLkBFU1f4eDN6f19236i4Jk3BXC7MMdc/view?usp=sharing', 30),
      ('professional_certificate', 'Jr Penetration Tester', 'TryHackMe', 'Apr 2024', 'https://tryhackme-certificates.s3-eu-west-1.amazonaws.com/THM-1F9FZJ3YIU.png', 40),
      ('professional_certificate', '21st Century Employability Skilling Program - Advanced', 'Wadhwani Foundation', 'Nov 2023', 'https://web.certificate.wfglobal.org/en/certificate?certificateId=655e4528cbe74e70300d680a', 50),
      ('professional_certificate', 'Cyber Security', 'Arena Web Security', 'Jul 2023', 'https://admission.arenawebsecurity.net/certificate/apiview/verify/?query=A43W1911S016', 60);

    -- Research Publications
    insert into public.resume_items (section, title, organization, badge_label, verification_url, highlights, sort_order)
    values
      (
        'research',
        'Data-Driven Strategies for Digital Native Market Segmentation Using Clustering',
        'Journal Article',
        'Q1 · Scopus · Elsevier',
        'https://doi.org/10.1016/j.ijcce.2024.04.002',
        array[
          'Journal: International Journal of Cognitive Computing in Engineering',
          'Indexing: Scopus (Open Access)',
          'Quartile: Q1',
          'Publisher: Elsevier',
          'Online ISSN: 2666-3074'
        ],
        10
      ),
      (
        'research',
        'Phishing URL Detection Using Comprehensive Feature Extraction and Machine Learning Techniques',
        'Conference Paper',
        'IEEE Symposium',
        'https://s24.ieeecsbdc.org/papers/156',
        array[
          'Conference: IEEE CS BDC SYMPOSIUM 2024',
          'Date: November 22-23, 2024',
          'Location: Jagannath University, Dhaka, Bangladesh'
        ],
        20
      );

    -- Experience
    insert into public.resume_items (section, title, organization, role_type, location, period, highlights, sort_order)
    values
      (
        'experience',
        'Information Security & Full-Stack Freelancer',
        'Upwork · Fiverr · Direct Portal (Fast Cyber Defense)',
        'Remote',
        'Worldwide',
        '04/2023 - Present',
        array[
          'Delivered penetration testing (VAPT) and security audit engagements for international clients.',
          'Performed deep OSINT investigations on fraudulent domains and threat-actor infrastructure.',
          'Helped executives and businesses recover compromised online accounts, servers, and cloud assets.',
          'Restored permanently deleted Google Drive and OneDrive enterprise assets.',
          'Provided full-stack web engineering, Linux server hardening, proxy/OPSEC consulting, and technical support.'
        ],
        10
      ),
      (
        'experience',
        'Trainer – Machine Learning with Python',
        'EDGE Project, Jagannath University',
        'Training',
        'Dhaka',
        '09/2024 - 05/2025',
        array[
          'Conducted hands-on training on Python-based machine learning concepts.',
          'Guided participants through supervised and unsupervised learning techniques, data preprocessing, and model evaluation.'
        ],
        20
      ),
      (
        'experience',
        'Trainer – Basic Computer Course',
        'Jagannath University IT Society',
        'Training',
        'Dhaka',
        '08/2024 - 02/2025',
        array[
          'Conducted training on computer fundamentals and MS Office (Word, PowerPoint, Excel).',
          'Helped participants build confidence in everyday digital tasks and professional documentation.'
        ],
        30
      ),
      (
        'experience',
        'Trainer – Microsoft Office',
        'EDGE Project, Jagannath University',
        'Training',
        'Dhaka',
        '08/2024 - 12/2024',
        array[
          'Conducted practical sessions on Microsoft Office applications including Word, Excel, and PowerPoint.',
          'Delivered foundational IT training as part of the national EDGE capacity-building initiative.'
        ],
        40
      ),
      (
        'experience',
        'Assistant Trainer (Linux Server Administration)',
        'AsiaInfo Innovation Technologies (Nanjing) Co. Ltd.',
        'Contract',
        'Dhaka',
        '04/2024 - 04/2024',
        array[
          'Trained Bangladesh Telecommunications Company Limited (BTCL) billing staff on Linux system and server administration.',
          'Covered system configuration, user management, and service hardening (on behalf of AsiaInfo Innovation Technologies).',
          'Credential: Certificate of completion received for the module delivered.'
        ],
        50
      ),
      (
        'experience',
        'Cloud Computing Trainee',
        'Prime Tech Solutions Ltd.',
        'Internship',
        'Dhaka',
        '09/2023 - 03/2024',
        array[
          'Implemented cloud technology initiatives with Linux Server (Ubuntu), Git, GitHub, MySQL, Nginx, AWS, Heroku, and DigitalOcean Droplets.',
          'Applied skills in web development with Django framework and CI/CD, optimizing project workflows through GitHub Actions.'
        ],
        60
      ),
      (
        'experience',
        'Cybersecurity Internship',
        'Arena Web Security - The Hacker''s Arena',
        'Internship',
        'Dhaka',
        '06/2023 - 07/2023',
        array[
          'Completed comprehensive 5-month Cybersecurity course with 1-month hands-on internship.',
          'Conducted vulnerability assessments and penetration testing on web applications and networks.',
          'Implemented Wazuh as a SIEM platform in a lab environment to centralize log collection, alerts, and security event analysis.'
        ],
        70
      );

    -- Leadership
    insert into public.resume_items (section, title, organization, period, highlights, sort_order)
    values
      (
        'leadership',
        'Research Fellow',
        'ITRRC Cybersecurity Research Lab, Jagannath University',
        '06/2024 - Present',
        array[
          'Coordinate lab activities and maintain the cybersecurity research community.',
          'Lead bi-weekly training and assessments for lab members on cybersecurity topics.',
          'Conduct cybersecurity research and support trainees working on security-focused projects and publications under lab mentors.',
          'Help lab members connect and discuss ideas with Jagannath University faculty and Bangladeshi-origin professors now based abroad.'
        ],
        10
      ),
      (
        'leadership',
        'Former President',
        'Jagannath University IT Society',
        '07/2023 - 07/2025',
        array[
          'Led a 200+ member student IT society, coordinating IT-focused events and workshops.',
          'Mentored members through learning activities and career-focused guidance.',
          'Organized and supported programs to build practical tech skills and peer collaboration.',
          'Now serve as an alumni / advisor to the new committee, sharing context and guidance when needed.'
        ],
        20
      ),
      (
        'leadership',
        'General Member to Vice President',
        'Jagannath University IT Society',
        '11/2017 - 07/2023',
        array[
          'Progressed from general member to elected Vice President of the society.',
          'Helped plan and organize IT events, seminars, and workshops for students.',
          'Developed strong organizational and leadership skills through coordinating activities and working with members.'
        ],
        30
      ),
      (
        'leadership',
        'Former Vice-President',
        'Sherpur District Student Welfare Council, Jagannath University',
        '01/2018 - 11/2021',
        array[
          'Co-founded and helped lead the council to support the educational and social needs of students from Sherpur District.',
          'Organized welfare and fundraising activities to assist underprivileged students with access to education and essential resources.'
        ],
        40
      );

    -- Education
    insert into public.resume_items (section, title, organization, location, period, sort_order)
    values
      ('education', 'MSc in Computer Science & Engineering', 'Jagannath University', 'Dhaka, Bangladesh', 'Ongoing', 10),
      ('education', 'BSc in Computer Science & Engineering', 'Jagannath University', 'Dhaka, Bangladesh', '2020', 20),
      ('education', 'Higher Secondary Certificate', 'Cambrian College', 'Dhaka, Bangladesh', '2016', 30),
      ('education', 'Secondary School Certificate', 'Sonkanda Dr. M. T Hossain High School', 'Sherpur, Bangladesh', '2014', 40);
  end if;
end;
$$;
