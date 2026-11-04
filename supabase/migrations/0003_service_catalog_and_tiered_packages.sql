-- 0003_service_catalog_and_tiered_packages.sql
-- Multi-disciplinary 5-Pillar Service Catalog & Tiered Order Packages

create table public.services (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  pillar public.service_pillar not null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  tagline text not null,
  description text not null,
  icon_name text not null default 'Shield',
  tools_tags text[] not null default '{}',
  requires_roe boolean not null default false,
  is_public boolean not null default true,
  is_featured boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index services_pillar_sort_idx on public.services (pillar, sort_order);
create index services_public_featured_idx on public.services (is_public, is_featured, sort_order);

create trigger services_set_updated_at
  before update on public.services
  for each row execute function public.set_updated_at();

alter table public.services enable row level security;

create policy "services_public_read"
  on public.services for select
  using (is_public is true or public.is_admin());

create policy "services_admin_all"
  on public.services for all
  using (public.is_admin())
  with check (public.is_admin());

create table public.service_packages (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services (id) on delete cascade,
  tier_name text not null check (tier_name in ('Starter', 'Standard', 'Enterprise', 'Custom')),
  summary text not null,
  price_cents int not null default 0 check (price_cents >= 0),
  currency char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  is_starting_price boolean not null default false,
  deposit_percent int not null default 50 check (deposit_percent between 0 and 100),
  delivery_days int not null default 7 check (delivery_days >= 1),
  revisions_included int not null default 2 check (revisions_included >= 0),
  auto_accept_days int not null default 3 check (auto_accept_days between 1 and 30),
  features jsonb not null default '[]'::jsonb,
  intake_questions jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (service_id, tier_name)
);

create index service_packages_service_idx on public.service_packages (service_id, sort_order);

alter table public.service_packages enable row level security;

create policy "service_packages_public_read"
  on public.service_packages for select
  using (is_active is true or public.is_admin());

create policy "service_packages_admin_all"
  on public.service_packages for all
  using (public.is_admin())
  with check (public.is_admin());

-- Seed the 5 core service pillars & initial tiered packages
do $$
declare
  v_vapt uuid;
  v_osint uuid;
  v_siem uuid;
  v_fullstack uuid;
  v_api uuid;
  v_cloud uuid;
  v_aiml uuid;
  v_support uuid;
begin
  -- Pillar 1: Cybersecurity & Offensive Security (C|EH)
  insert into public.services (slug, pillar, title, tagline, description, icon_name, tools_tags, requires_roe, is_public, is_featured, sort_order)
  values (
    'vapt-penetration-testing',
    'cybersecurity',
    'Penetration Testing & VAPT (C|EH)',
    'OWASP Top 10, API, network & cloud offensive security assessments',
    'Comprehensive C|EH-led manual and automated penetration testing across web applications, REST/GraphQL APIs, and network infrastructure with executive + developer remediation reports and re-test verification.',
    'Shield',
    array['Burp Suite Pro', 'OWASP ZAP', 'Nmap', 'Metasploit', 'SQLmap', 'Nuclei', 'Postman'],
    true,
    true,
    true,
    10
  ) returning id into v_vapt;

  insert into public.service_packages (service_id, tier_name, summary, price_cents, deposit_percent, delivery_days, revisions_included, features, intake_questions, sort_order)
  values
    (v_vapt, 'Starter', 'Single Web App / API Endpoint Security Audit & OWASP Top 10 Check', 45000, 50, 5, 1,
     '["Manual OWASP Top 10 assessment", "CVSS v3.1 severity scoring", "PoC reproduction steps", "Executive & technical PDF report"]'::jsonb,
     '["Target URLs or IP ranges", "Staging/Test credentials (if authenticated test)", "Preferred testing window"]'::jsonb, 1),
    (v_vapt, 'Standard', 'Full-Scope Web Application + API Penetration Test + Free Re-Test', 120000, 50, 10, 2,
     '["Full authenticated & unauthenticated VAPT", "Business logic & auth bypass testing", "API endpoint fuzzing & IDOR checks", "Detailed remediation walkthrough + 1 full re-test"]'::jsonb,
     '["Target domains & API specs", "User roles & test accounts", "Excluded endpoints or third-party integrations"]'::jsonb, 2),
    (v_vapt, 'Enterprise', 'Multi-Asset Infrastructure, Cloud & Application Red-Team Assessment', 280000, 50, 21, 3,
     '["Web + API + External Network + Cloud IAM audit", "Continuous slack/portal findings stream", "Executive board presentation", "2 verification re-tests + compliance attestation letter"]'::jsonb,
     '["Full asset inventory", "Compliance target (ISO 27001 / SOC 2 / GDPR)", "Primary technical contact"]'::jsonb, 3);

  insert into public.services (slug, pillar, title, tagline, description, icon_name, tools_tags, requires_roe, is_public, is_featured, sort_order)
  values (
    'osint-threat-investigation',
    'cybersecurity',
    'OSINT & Digital Fraud Investigation',
    'Deep-dive open-source intelligence, scammer network mapping & brand protection',
    'Trace digital footprints, investigate impersonation or scam networks, audit corporate attack surface exposure, and compile court/abuse-ready evidentiary reports.',
    'Search',
    array['Maltego', 'Shodan', 'SpiderFoot', 'theHarvester', 'Recon-ng', 'DNS/WHOIS Forensics'],
    false,
    true,
    true,
    20
  ) returning id into v_osint;

  insert into public.service_packages (service_id, tier_name, summary, price_cents, deposit_percent, delivery_days, revisions_included, features, intake_questions, sort_order)
  values
    (v_osint, 'Starter', 'External Digital Footprint & Attack Surface Reconnaissance', 30000, 50, 4, 1,
     '["Domain, subdomain & leaked credential check", "Executive digital exposure summary", "Prioritized takedown & hardening actions"]'::jsonb,
     '["Target organization or domain names", "Specific concerns or suspected leaks"]'::jsonb, 1),
    (v_osint, 'Standard', 'Full Scam / Threat Actor Network Investigation & Evidence Dossier', 85000, 50, 7, 2,
     '["Infrastructure & registrar correlation", "Social, wallet & communication trace", "Registrar/host abuse takedown packet", "Structured forensic timeline report"]'::jsonb,
     '["Known URLs, emails, handles, or transaction references", "Timeline of events"]'::jsonb, 2);

  insert into public.services (slug, pillar, title, tagline, description, icon_name, tools_tags, requires_roe, is_public, is_featured, sort_order)
  values (
    'siem-security-monitoring',
    'cybersecurity',
    'SIEM Deployment & Security Hardening (Wazuh)',
    'Centralized log monitoring, intrusion detection & endpoint security',
    'Design, deploy, and tune Wazuh SIEM/XDR across Linux and Windows fleets with custom detection rules, file integrity monitoring, and real-time alerting.',
    'Activity',
    array['Wazuh SIEM', 'OpenSearch', 'Suricata', 'Linux Auditd', 'Sysmon'],
    false,
    true,
    false,
    30
  ) returning id into v_siem;

  insert into public.service_packages (service_id, tier_name, summary, price_cents, deposit_percent, delivery_days, revisions_included, features, intake_questions, sort_order)
  values
    (v_siem, 'Standard', 'Wazuh SIEM Server Setup + Up to 15 Monitored Agents & Alerting', 75000, 50, 7, 2,
     '["Hardened Wazuh Manager & Dashboard deployment", "Agent enrollment (up to 15 hosts)", "Custom Slack/Email critical alert rules", "Handover runbook & admin training"]'::jsonb,
     '["Hosting environment (AWS/DigitalOcean/On-prem)", "Number and OS of target endpoints"]'::jsonb, 1);

  -- Pillar 2: Full-Stack Web & Custom Software Engineering
  insert into public.services (slug, pillar, title, tagline, description, icon_name, tools_tags, requires_roe, is_public, is_featured, sort_order)
  values (
    'fullstack-web-development',
    'development',
    'Full-Stack Web & Portal Development',
    'Production-grade Next.js, TypeScript, Supabase & Python/Django web applications',
    'End-to-end engineering of high-performance SaaS applications, client portals, CRM systems, and secure business platforms built with security-by-design architecture.',
    'Code',
    array['Next.js', 'TypeScript', 'React', 'Tailwind CSS', 'Supabase', 'PostgreSQL', 'Python', 'Django'],
    false,
    true,
    true,
    40
  ) returning id into v_fullstack;

  insert into public.service_packages (service_id, tier_name, summary, price_cents, deposit_percent, delivery_days, revisions_included, features, intake_questions, sort_order)
  values
    (v_fullstack, 'Starter', 'High-Conversion Landing Site or Custom Feature Module', 60000, 50, 7, 2,
     '["Responsive Next.js + Tailwind v4 UI", "SEO, schema markup & Core Web Vitals optimization", "Contact/lead database integration", "Vercel/Cloudflare production deployment"]'::jsonb,
     '["Project goals & reference sites", "Brand assets or copy available"]'::jsonb, 1),
    (v_fullstack, 'Standard', 'Full-Stack Web App / Client Portal with Auth, DB & Dashboard', 180000, 50, 14, 3,
     '["Role-based authentication & RLS database schema", "Custom admin & user dashboards", "R2/S3 file storage & Resend email integration", "Full source code & deployment pipeline"]'::jsonb,
     '["Core user roles & workflows", "Third-party APIs or payment methods required"]'::jsonb, 2),
    (v_fullstack, 'Enterprise', 'Custom Enterprise Platform / SaaS MVP + Security Hardening', 420000, 40, 30, 4,
     '["Complete multi-module architecture", "Atomic database transactions & audit logging", "Built-in OWASP security hardening", "30-day post-launch warranty support"]'::jsonb,
     '["Product specification or wireframe link", "Target launch timeline"]'::jsonb, 3);

  insert into public.services (slug, pillar, title, tagline, description, icon_name, tools_tags, requires_roe, is_public, is_featured, sort_order)
  values (
    'api-backend-engineering',
    'development',
    'API Engineering, Integrations & Bug Fixing',
    'Secure REST/Webhook APIs, payment/storage integrations & codebase rescue',
    'Build, debug, or refactor backend APIs, third-party webhooks, authentication flows, and performance bottlenecks in existing Node.js/TypeScript, Python, or PHP codebases.',
    'Terminal',
    array['TypeScript', 'Node.js', 'Python', 'PostgreSQL', 'MySQL', 'REST APIs', 'Cloudflare R2'],
    false,
    true,
    false,
    50
  ) returning id into v_api;

  insert into public.service_packages (service_id, tier_name, summary, price_cents, deposit_percent, delivery_days, revisions_included, features, intake_questions, sort_order)
  values
    (v_api, 'Starter', 'Targeted Bug Fix, Security Patch or Single API Integration', 25000, 50, 3, 2,
     '["Root-cause diagnosis & clean code fix", "Input validation & error handling", "Pull request with verification steps"]'::jsonb,
     '["Repository stack & issue description", "Steps to reproduce or API documentation"]'::jsonb, 1),
    (v_api, 'Standard', 'Custom Backend Module, Webhook Pipeline or Auth Overhaul', 85000, 50, 7, 2,
     '["End-to-end API design & implementation", "Rate limiting, JWT/session security & logging", "Automated integration tests"]'::jsonb,
     '["Architecture overview & target endpoints"]'::jsonb, 2);

  -- Pillar 3: Cloud, DevOps & Linux Infrastructure
  insert into public.services (slug, pillar, title, tagline, description, icon_name, tools_tags, requires_roe, is_public, is_featured, sort_order)
  values (
    'cloud-linux-devops',
    'cloud_devops',
    'Cloud Architecture, Linux Hardening & CI/CD',
    'AWS, Azure, DigitalOcean, Linux server administration & Docker automation',
    'Provision, migrate, and harden Linux production servers (Ubuntu/CentOS), configure Docker & Nginx reverse proxies, implement automated backups, and build zero-downtime GitHub Actions/Jenkins pipelines.',
    'Server',
    array['Linux (Ubuntu/CentOS)', 'AWS', 'Azure IAM', 'DigitalOcean', 'Docker', 'Nginx', 'GitHub Actions', 'Cloudflare'],
    false,
    true,
    true,
    60
  ) returning id into v_cloud;

  insert into public.service_packages (service_id, tier_name, summary, price_cents, deposit_percent, delivery_days, revisions_included, features, intake_questions, sort_order)
  values
    (v_cloud, 'Starter', 'Linux Server Setup, SSL/Nginx Configuration & CIS Hardening', 30000, 50, 3, 1,
     '["SSH key-only auth, UFW/Fail2ban & kernel hardening", "Nginx reverse proxy + TLS/Cloudflare setup", "Automated off-site database/file backup script"]'::jsonb,
     '["Cloud provider & OS version", "Application stack running on the server"]'::jsonb, 1),
    (v_cloud, 'Standard', 'Dockerization + Automated CI/CD Pipeline & Cloud Migration', 90000, 50, 7, 2,
     '["Multi-stage Docker & Compose production setup", "GitHub Actions build, test & deploy workflow", "Zero-downtime migration & secrets management"]'::jsonb,
     '["Current hosting setup & target cloud provider", "Repository structure"]'::jsonb, 2);

  -- Pillar 4: Applied AI/ML & Intelligent Automation
  insert into public.services (slug, pillar, title, tagline, description, icon_name, tools_tags, requires_roe, is_public, is_featured, sort_order)
  values (
    'ai-ml-automation',
    'ai_ml',
    'Applied Machine Learning & AI Automation',
    'Custom ML pipelines, threat/phishing detection models & LLM workflow integration',
    'Backed by published Q1 Scopus & IEEE research—build custom Python machine learning pipelines, classification/clustering models, data preprocessing workflows, and practical AI integrations.',
    'Cpu',
    array['Python', 'Scikit-Learn', 'Pandas', 'Feature Engineering', 'LLM APIs', 'Automation Scripts'],
    false,
    true,
    true,
    70
  ) returning id into v_aiml;

  insert into public.service_packages (service_id, tier_name, summary, price_cents, deposit_percent, delivery_days, revisions_included, features, intake_questions, sort_order)
  values
    (v_aiml, 'Standard', 'Custom ML Model / Data Pipeline or AI Workflow Integration', 95000, 50, 10, 2,
     '["Data cleaning, feature extraction & model training", "Evaluation metrics & reproducible Jupyter/Python codebase", "API wrapper or automation script deployment"]'::jsonb,
     '["Dataset description & target prediction/automation goal"]'::jsonb, 1);

  -- Pillar 5: Executive Tech Support, Digital Recovery & Retainers
  insert into public.services (slug, pillar, title, tagline, description, icon_name, tools_tags, requires_roe, is_public, is_featured, sort_order)
  values (
    'executive-tech-support-recovery',
    'tech_support',
    'Account/Data Recovery & Executive Tech Support',
    'Compromised account recovery, cloud file restoration, OPSEC/proxy consulting & priority support',
    'Hands-on technical rescue and consulting: recover hacked business/social accounts, restore deleted cloud drive files (Google Workspace / OneDrive / M365), configure anti-detect/proxy/fingerprint environments, or resolve urgent IT blockers.',
    'LifeBuoy',
    array['Account Recovery', 'Google Workspace', 'Microsoft 365', 'Cloud Forensics', 'Proxy/OPSEC', 'System Rescue'],
    false,
    true,
    true,
    80
  ) returning id into v_support;

  insert into public.service_packages (service_id, tier_name, summary, price_cents, deposit_percent, delivery_days, revisions_included, features, intake_questions, sort_order)
  values
    (v_support, 'Starter', 'Dedicated Technical Troubleshooting, Proxy/OPSEC or Cloud Support Session', 20000, 100, 2, 1,
     '["Direct diagnosis & hands-on resolution", "Cloud drive / M365 / Google Workspace configuration", "Post-session security checklist"]'::jsonb,
     '["Platform/system affected", "Urgency & exact symptoms"]'::jsonb, 1),
    (v_support, 'Standard', 'Compromised Account / Business Asset Recovery & Post-Incident Lockdown', 55000, 50, 5, 2,
     '["Forensic compromise assessment & escalation", "Account/drive restoration workflow", "MFA, session revocation & email DNS (SPF/DKIM/DMARC) lockdown"]'::jsonb,
     '["Affected platform/domain", "When compromise or data loss occurred"]'::jsonb, 2),
    (v_support, 'Enterprise', 'Monthly Technical & Security Retainer (Priority On-Call Support)', 150000, 100, 30, 4,
     '["Up to 15 dedicated engineering/security hours per month", "Priority <12h response SLA", "Monthly server/security health check & patching"]'::jsonb,
     '["Systems/websites covered under retainer", "Primary communication channel"]'::jsonb, 3);
end;
$$;
