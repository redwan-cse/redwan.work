// Single source of truth for site-wide identity, credentials, and 5 Service Pillars.

export type ServicePillarKey =
  | 'cybersecurity'
  | 'development'
  | 'cloud_devops'
  | 'ai_ml'
  | 'tech_support';

export interface ServicePackageSeed {
  tier: 'starter' | 'standard' | 'enterprise';
  name: string;
  priceCents: number;
  deliveryDays: number;
  revisions: number;
  depositPercent: number;
  popular?: boolean;
  summary: string;
  features: string[];
}

export interface ServiceCatalogItem {
  slug: string;
  pillar: ServicePillarKey;
  pillarLabel: string;
  title: string;
  tagline: string;
  description: string;
  requiresRoe: boolean;
  startingPriceCents: number;
  deliveryDaysMin: number;
  deliveryDaysMax: number;
  highlights: string[];
  packages: ServicePackageSeed[];
}

export const SITE = {
  name: 'Md. Redwan Ahmed',
  role: 'Cybersecurity Specialist, Full-Stack Engineer & Founder of Fast Cyber Defense',
  shortRole: 'Security Specialist & Full-Stack Consultant',
  tagline:
    'Cybersecurity Specialist (CCEP, CNSP, CAP), Full-Stack Software Engineer, Cloud/DevOps Architect, and Executive Technical Consultant delivering offensive security assessments, custom software, AI pipelines, and rapid incident recovery.',
  url: process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://redwan.work',
  email: 'contact@redwan.work',
  whatsappNumber: '8801776387624',
  phoneDisplay: '+88017-7638-7624',
  calComUrl: 'https://cal.com/redwancse',
  company: {
    name: 'Fast Cyber Defense',
    url: 'https://fastcyberdefense.com',
  },
  profileImage: '/profile.jpg',
  credentials: [
    { code: 'CCEP', label: 'Certified Cybersecurity Educator Professional' },
    { code: 'GitHub', label: 'GitHub Foundations Certified' },
    { code: 'CNSP', label: 'Certified Network Security Practitioner' },
    { code: 'CAP', label: 'Certified AppSec Practitioner' },
    { code: 'Q1 / IEEE', label: 'Published AI & Security Researcher' },
  ],
  socials: {
    github: 'https://github.com/redwan-cse',
    linkedin: 'https://linkedin.com/in/redwancse',
    twitter: 'https://twitter.com/redwancse',
    facebook: 'https://facebook.com/redwancse',
    instagram: 'https://instagram.com/redwancse',
    upwork: 'https://www.upwork.com/freelancers/~01bd47ab2da223b848',
    fiverr: 'https://www.fiverr.com/redwancse',
  },
} as const;

export const SERVICE_PILLARS: Record<
  ServicePillarKey,
  {
    key: ServicePillarKey;
    label: string;
    shortLabel: string;
    badge: string;
    summary: string;
  }
> = {
  cybersecurity: {
    key: 'cybersecurity',
    label: 'Cybersecurity & Offensive Security',
    shortLabel: 'Cybersecurity & VAPT',
    badge: 'OWASP · PTES',
    summary:
      'OWASP/PTES penetration testing, vulnerability assessments, OSINT & fraud investigations, and Wazuh SIEM engineering.',
  },
  development: {
    key: 'development',
    label: 'Full-Stack Web & Custom Software',
    shortLabel: 'Full-Stack Engineering',
    badge: 'Next.js · TypeScript · Python',
    summary:
      'Production-grade web apps, client portals, SaaS platforms, REST/GraphQL APIs, and complex bug resolution.',
  },
  cloud_devops: {
    key: 'cloud_devops',
    label: 'Cloud, DevOps & Linux Infrastructure',
    shortLabel: 'Cloud & Linux Ops',
    badge: 'AWS · Azure · Linux',
    summary:
      'Ubuntu/CentOS server hardening, Docker deployments, zero-downtime cloud migrations, and CI/CD pipelines.',
  },
  ai_ml: {
    key: 'ai_ml',
    label: 'Applied AI/ML & Automation',
    shortLabel: 'AI/ML & Automation',
    badge: 'Research-Backed ML',
    summary:
      'Custom machine learning pipelines, LLM agent workflows, and real-time phishing/fraud detection engines.',
  },
  tech_support: {
    key: 'tech_support',
    label: 'Executive Tech Support & Digital Recovery',
    shortLabel: 'Tech Support & Recovery',
    badge: 'Priority SLA & Retainers',
    summary:
      'Emergency compromised account/server recovery, cloud storage restoration, OPSEC/proxy setups, and monthly retainers.',
  },
};

export const SERVICE_CATALOG: ServiceCatalogItem[] = [
  {
    slug: 'vapt-penetration-testing',
    pillar: 'cybersecurity',
    pillarLabel: 'Cybersecurity & Offensive Security',
    title: 'Web, API & Network Penetration Testing (VAPT)',
    tagline: 'Manual & automated offensive security assessments with executive & technical remediation reports.',
    description:
      'Comprehensive offensive security testing aligned with OWASP Top 10, OWASP API Security, and PTES. Includes signed Rules of Engagement (RoE), manual exploitation validation, PoC walkthroughs, CVSS v3.1 risk scoring, and free re-test verification.',
    requiresRoe: true,
    startingPriceCents: 12000,
    deliveryDaysMin: 4,
    deliveryDaysMax: 14,
    highlights: [
      'OWASP & PTES manual exploitation & business-logic testing',
      'Executive summary + developer-ready remediation blueprint',
      'Signed Rules of Engagement (RoE) & NDA protection',
      'Complimentary post-fix verification re-test',
    ],
    packages: [
      {
        tier: 'starter',
        name: 'Starter Surface Audit',
        priceCents: 12000,
        deliveryDays: 4,
        revisions: 1,
        depositPercent: 50,
        summary: 'Single web app or API surface (up to 15 endpoints) OWASP Top 10 assessment.',
        features: [
          'OWASP Top 10 & auth session testing',
          'CVSS-scored PDF findings report',
          '1 round of post-fix re-testing',
        ],
      },
      {
        tier: 'standard',
        name: 'Full-Scope VAPT + Re-Test',
        priceCents: 120000,
        deliveryDays: 8,
        revisions: 2,
        depositPercent: 50,
        popular: true,
        summary: 'Deep manual penetration test across web app, API, and cloud perimeter.',
        features: [
          'Deep manual business-logic & privilege escalation testing',
          'Full PoC exploit evidence + remediation walkthrough call',
          '2 rounds of verification re-testing + Security Certificate',
        ],
      },
      {
        tier: 'enterprise',
        name: 'Enterprise Red-Team & Compliance Suite',
        priceCents: 240000,
        deliveryDays: 14,
        revisions: 3,
        depositPercent: 40,
        summary: 'Multi-environment Web + API + Cloud + Infrastructure offensive security engagement.',
        features: [
          'Multi-app, API, cloud IAM & network perimeter assessment',
          'SOC2 / ISO 27001 / HIPAA audit-ready reporting package',
          '30-day post-assessment engineering advisory',
        ],
      },
    ],
  },
  {
    slug: 'osint-threat-investigation',
    pillar: 'cybersecurity',
    pillarLabel: 'Cybersecurity & Offensive Security',
    title: 'OSINT, Threat Intelligence & Cyber Fraud Investigation',
    tagline: 'Deep open-source intelligence, digital footprint tracing, and cyber fraud evidence compilation.',
    description:
      'Discreet, forensically sound OSINT and threat investigation for executives, legal teams, and businesses experiencing impersonation, data exposure, BEC scams, or targeted harassment.',
    requiresRoe: false,
    startingPriceCents: 8000,
    deliveryDaysMin: 2,
    deliveryDaysMax: 10,
    highlights: [
      'Domain, infrastructure, dark-web & identity attribution',
      'Phishing & brand impersonation takedown intelligence',
      'Chain-of-custody evidence dossier in Encrypted Deliverables Vault',
    ],
    packages: [
      {
        tier: 'starter',
        name: 'Targeted Exposure Scan',
        priceCents: 8000,
        deliveryDays: 2,
        revisions: 1,
        depositPercent: 100,
        summary: 'Executive or domain breach exposure & digital footprint intelligence report.',
        features: [
          'Leaked credentials & dark-web exposure check',
          'Domain & infrastructure footprint mapping',
          'Hardening & takedown action checklist',
        ],
      },
      {
        tier: 'standard',
        name: 'Full Incident & Fraud Investigation',
        priceCents: 22000,
        deliveryDays: 5,
        revisions: 2,
        depositPercent: 50,
        popular: true,
        summary: 'Comprehensive cyber fraud, BEC, or threat actor attribution investigation.',
        features: [
          'Cross-platform OSINT & infrastructure pivot analysis',
          'Timeline reconstruction & evidence preservation dossier',
          'Live executive briefing & containment roadmap',
        ],
      },
      {
        tier: 'enterprise',
        name: 'Enterprise Threat Attribution & Takedown Suite',
        priceCents: 48000,
        deliveryDays: 10,
        revisions: 3,
        depositPercent: 50,
        summary: 'Multi-domain threat actor tracking, registrar abuse takedowns, and executive OPSEC hardening.',
        features: [
          'Multi-domain infrastructure & dark-web attribution',
          'Registrar/host takedown filings & DMARC/SPF lockdown',
          'Executive & organization OPSEC protection playbook',
        ],
      },
    ],
  },
  {
    slug: 'siem-security-monitoring',
    pillar: 'cybersecurity',
    pillarLabel: 'Cybersecurity & Offensive Security',
    title: 'Wazuh SIEM Deployment & Threat Detection Engineering',
    tagline: 'Centralized log monitoring, custom detection rules, FIM, and real-time incident alerting.',
    description:
      'End-to-end deployment and tuning of Wazuh SIEM/XDR across Linux and Windows fleets, including File Integrity Monitoring (FIM), active response, and Slack/Telegram/Email alert routing.',
    requiresRoe: false,
    startingPriceCents: 14000,
    deliveryDaysMin: 3,
    deliveryDaysMax: 12,
    highlights: [
      'Production Wazuh Server + Indexer + Dashboard deployment',
      'Custom decoders, MITRE ATT&CK rules & active response',
      'Endpoint agent enrollment & CIS benchmark compliance',
    ],
    packages: [
      {
        tier: 'starter',
        name: 'Core Wazuh SIEM Setup',
        priceCents: 14000,
        deliveryDays: 3,
        revisions: 1,
        depositPercent: 50,
        summary: 'Wazuh SIEM server deployment + up to 10 endpoint agents & alert routing.',
        features: [
          'Hardened Wazuh stack installation',
          'Up to 10 Linux/Windows agents enrolled',
          'Critical alert notifications configured',
        ],
      },
      {
        tier: 'standard',
        name: 'Custom SOC Rules & Active Response',
        priceCents: 32000,
        deliveryDays: 7,
        revisions: 2,
        depositPercent: 50,
        popular: true,
        summary: 'Custom detection engineering, FIM, vulnerability detector, and automated blocking.',
        features: [
          'Up to 35 endpoints + cloud log integration',
          'Custom XML rules & automated IP blocking',
          'Admin runbook & handover training session',
        ],
      },
      {
        tier: 'enterprise',
        name: 'Enterprise SIEM Fleet & Compliance',
        priceCents: 68000,
        deliveryDays: 12,
        revisions: 3,
        depositPercent: 40,
        summary: 'High-availability Wazuh cluster with CIS compliance dashboards and custom integrations.',
        features: [
          'Multi-node Wazuh cluster & cloud log ingestion',
          'PCI-DSS / ISO 27001 / HIPAA compliance dashboards',
          '30-day tuning & SOC operational handover',
        ],
      },
    ],
  },
  {
    slug: 'fullstack-web-development',
    pillar: 'development',
    pillarLabel: 'Full-Stack Web & Custom Software',
    title: 'Full-Stack Web Apps, Client Portals & Custom SaaS',
    tagline: 'High-performance Next.js, TypeScript, PostgreSQL, and Python/Django platforms built with security-first architecture.',
    description:
      'From sleek marketing sites to complex multi-tenant SaaS applications, client CRMs, invoicing portals, and custom REST/GraphQL backends—engineered for speed, strict access control, and maintainability.',
    requiresRoe: false,
    startingPriceCents: 12000,
    deliveryDaysMin: 3,
    deliveryDaysMax: 21,
    highlights: [
      'Next.js App Router, React 19, TypeScript & Tailwind CSS v4',
      'PostgreSQL with Row-Level Security (RLS) or Python/Django',
      'Encrypted Vault storage, transactional email workflows & multi-currency billing',
      'Security-hardened authentication & audit logging out of the box',
    ],
    packages: [
      {
        tier: 'starter',
        name: 'Starter Feature / Landing Page / Bug Sprint',
        priceCents: 12000,
        deliveryDays: 3,
        revisions: 2,
        depositPercent: 50,
        summary: 'Targeted full-stack feature build, responsive landing page, API integration, or bug resolution.',
        features: [
          'Dedicated full-stack implementation or bug fix sprint',
          'Clean TypeScript/Python PR with tests & documentation',
          'Security & performance review of touched routes',
        ],
      },
      {
        tier: 'standard',
        name: 'Production Web App / MVP Launch',
        priceCents: 38000,
        deliveryDays: 10,
        revisions: 3,
        depositPercent: 50,
        popular: true,
        summary: 'Complete custom web application, dashboard, or high-converting business platform.',
        features: [
          'Custom responsive UI + dark/light theme + motion polish',
          'Authentication, database schema, RLS & admin controls',
          'Vercel/Cloud deployment + 14-day warranty support',
        ],
      },
      {
        tier: 'enterprise',
        name: 'Full Client Portal / Custom CRM System',
        priceCents: 85000,
        deliveryDays: 21,
        revisions: 4,
        depositPercent: 40,
        summary: 'End-to-end multi-role portal with orders, file vault, invoicing, tickets, and audit trail.',
        features: [
          'Role-based Admin + Client Portal architecture',
          'Encrypted file delivery, billing ledger & notifications',
          '30-day post-launch support & architecture documentation',
        ],
      },
    ],
  },
  {
    slug: 'cloud-linux-devops',
    pillar: 'cloud_devops',
    pillarLabel: 'Cloud, DevOps & Linux Infrastructure',
    title: 'Cloud Infrastructure, Linux Hardening & DevOps Automation',
    tagline: 'AWS, Azure, DigitalOcean & Linux server provisioning, CIS hardening, Docker, and CI/CD pipelines.',
    description:
      'Lock down and scale your infrastructure. Includes Ubuntu/CentOS/Debian kernel & SSH hardening, Nginx/Cloudflare WAF tuning, Docker containerization, automated backups, and zero-downtime GitHub Actions deployments.',
    requiresRoe: false,
    startingPriceCents: 8000,
    deliveryDaysMin: 2,
    deliveryDaysMax: 10,
    highlights: [
      'CIS-aligned Linux server hardening (SSH, UFW/nftables, Fail2ban)',
      'AWS / Azure / DigitalOcean architecture & cost optimization',
      'Docker Compose, reverse proxies, SSL/TLS & Cloudflare WAF',
    ],
    packages: [
      {
        tier: 'starter',
        name: 'Linux Server Hardening & WAF Setup',
        priceCents: 8000,
        deliveryDays: 2,
        revisions: 1,
        depositPercent: 100,
        summary: 'Complete security hardening and firewall configuration for 1–2 production servers.',
        features: [
          'SSH, firewall, Fail2ban & unattended security patching',
          'Cloudflare SSL/TLS, WAF rules & rate limiting',
          'Before/after security posture report',
        ],
      },
      {
        tier: 'standard',
        name: 'Cloud Deployment, Docker & CI/CD Pipeline',
        priceCents: 22000,
        deliveryDays: 5,
        revisions: 2,
        depositPercent: 50,
        popular: true,
        summary: 'Containerized multi-service cloud setup with automated CI/CD and encrypted backups.',
        features: [
          'Dockerized staging & production environments',
          'GitHub Actions zero-downtime deployment workflow',
          'Automated off-site backups & uptime alerting',
        ],
      },
      {
        tier: 'enterprise',
        name: 'Multi-Server Cloud Architecture & HA Ops',
        priceCents: 48000,
        deliveryDays: 10,
        revisions: 3,
        depositPercent: 50,
        summary: 'High-availability cloud architecture, load balancing, zero-downtime migration, and monitoring.',
        features: [
          'Multi-server cloud topology & zero-downtime migration',
          'Centralized logs, metrics, alerts & disaster recovery',
          'Complete infrastructure documentation & handover',
        ],
      },
    ],
  },
  {
    slug: 'ai-ml-automation',
    pillar: 'ai_ml',
    pillarLabel: 'Applied AI/ML & Automation',
    title: 'Applied AI/ML Systems, Threat Models & Workflow Automation',
    tagline: 'Custom machine learning pipelines, LLM integrations, and real-time anomaly/phishing detection.',
    description:
      'Backed by Q1 Scopus and IEEE published research in machine learning and cybersecurity. Build production AI assistants, automated document/lead triage pipelines, or custom classification models.',
    requiresRoe: false,
    startingPriceCents: 15000,
    deliveryDaysMin: 4,
    deliveryDaysMax: 16,
    highlights: [
      'LLM RAG pipelines, structured extraction & agent workflows',
      'Custom Python scikit-learn / PyTorch classification & anomaly models',
      'API deployment with strict rate-limiting & prompt-injection guardrails',
    ],
    packages: [
      {
        tier: 'starter',
        name: 'AI Workflow / LLM API Integration',
        priceCents: 15000,
        deliveryDays: 4,
        revisions: 2,
        depositPercent: 50,
        summary: 'Integrate Gemini/OpenAI structured workflows or intelligent automation into your product.',
        features: [
          'Prompt engineering, schema validation & fallback handling',
          'Token cost optimization & security guardrails',
          'Production API endpoint + UI integration',
        ],
      },
      {
        tier: 'standard',
        name: 'Custom ML Pipeline / Detection Engine',
        priceCents: 39000,
        deliveryDays: 10,
        revisions: 2,
        depositPercent: 50,
        popular: true,
        summary: 'End-to-end feature engineering, model training, evaluation, and inference API.',
        features: [
          'Dataset curation, feature engineering & model benchmarking',
          'Explainable metrics report + containerized inference API',
          'Retraining scripts & technical documentation',
        ],
      },
      {
        tier: 'enterprise',
        name: 'Enterprise AI/RAG & Automation Platform',
        priceCents: 82000,
        deliveryDays: 16,
        revisions: 3,
        depositPercent: 40,
        summary: 'Full-scale vector RAG knowledge system, multi-step AI agents, and custom analytics dashboard.',
        features: [
          'Vector database ingestion, hybrid search & citation guardrails',
          'Role-based access control, audit logging & eval suite',
          'Full deployment + 30-day post-launch tuning',
        ],
      },
    ],
  },
  {
    slug: 'executive-tech-support-recovery',
    pillar: 'tech_support',
    pillarLabel: 'Executive Tech Support & Digital Recovery',
    title: 'Emergency Incident Recovery, Malware Cleanup & Executive Tech Support',
    tagline: 'Rapid-response compromised server/site cleanup, account recovery, cloud data rescue, and hands-on technical troubleshooting.',
    description:
      'Need a trusted specialist right now? Whether a production server is compromised, a WordPress/web app is defaced, DNS/email deliverability is broken, or you need high-priority technical troubleshooting—get direct, confidential hands-on resolution.',
    requiresRoe: false,
    startingPriceCents: 5000,
    deliveryDaysMin: 1,
    deliveryDaysMax: 5,
    highlights: [
      'Same-day triage for compromised websites, servers & cloud accounts',
      'Malware/backdoor removal, root-cause analysis & persistence cleanup',
      'Email deliverability (SPF/DKIM/DMARC), DNS, SSL & cloud data recovery',
      'Confidential 1-on-1 remote engineering & OPSEC support',
    ],
    packages: [
      {
        tier: 'starter',
        name: 'Priority Tech Support / Troubleshooting Session',
        priceCents: 5000,
        deliveryDays: 1,
        revisions: 1,
        depositPercent: 100,
        summary: 'Dedicated hands-on fix for server, DNS, email, SSL, proxy/OPSEC, or software issues.',
        features: [
          'Rapid root-cause diagnosis & direct resolution',
          'Configuration hardening & verification test',
          'Summary of changes made',
        ],
      },
      {
        tier: 'standard',
        name: 'Emergency Breach Cleanup & Recovery',
        priceCents: 15000,
        deliveryDays: 3,
        revisions: 2,
        depositPercent: 50,
        popular: true,
        summary: 'Full malware/backdoor eradication, server restoration, and post-breach lock-down.',
        features: [
          'Forensic persistence check & backdoor removal',
          'Credential rotation, WAF shielding & patch hardening',
          '14-day post-incident monitoring & incident summary',
        ],
      },
      {
        tier: 'enterprise',
        name: 'Full Server & Cloud Incident Restoration',
        priceCents: 35000,
        deliveryDays: 5,
        revisions: 3,
        depositPercent: 50,
        summary: 'Multi-server forensic cleanup, clean infrastructure rebuild, and disaster recovery.',
        features: [
          'Clean OS/container rebuild & verified backup restoration',
          'End-to-end secret rotation, WAF & SIEM alerting setup',
          '30-day priority post-incident watch',
        ],
      },
    ],
  },
  {
    slug: 'monthly-security-and-engineering-retainer',
    pillar: 'tech_support',
    pillarLabel: 'Executive Tech Support & Digital Recovery',
    title: 'Dedicated Monthly Security & Engineering Retainer',
    tagline: 'Your on-call Security Advisor, Full-Stack Developer & Infrastructure Guardian on a predictable monthly plan.',
    description:
      'Built for long-term client relationships. Reserve guaranteed monthly hours for continuous vulnerability monitoring, feature development, server maintenance, code reviews, and priority emergency SLA.',
    requiresRoe: false,
    startingPriceCents: 20000,
    deliveryDaysMin: 30,
    deliveryDaysMax: 30,
    highlights: [
      'Guaranteed monthly engineering & security hours',
      'Priority SLA response via Client Portal & WhatsApp',
      'Monthly security health check, patching & executive report',
    ],
    packages: [
      {
        tier: 'starter',
        name: 'Essential Care Retainer (10 hrs/mo)',
        priceCents: 20000,
        deliveryDays: 30,
        revisions: 2,
        depositPercent: 100,
        summary: 'Ongoing server patching, uptime monitoring, security checks, and on-demand support.',
        features: [
          '10 dedicated hours/month across security, dev & ops',
          'Monthly vulnerability scan & server patch cycle',
          'Priority Client Portal ticket SLA (< 12h)',
        ],
      },
      {
        tier: 'standard',
        name: 'Growth Partner Retainer (25 hrs/mo)',
        priceCents: 45000,
        deliveryDays: 30,
        revisions: 4,
        depositPercent: 100,
        popular: true,
        summary: 'Continuous feature development, penetration testing, and DevOps management.',
        features: [
          '25 dedicated hours/month across all 5 service pillars',
          'Continuous PR security reviews & feature shipping',
          'VIP priority SLA (< 4h) + monthly strategy call',
        ],
      },
      {
        tier: 'enterprise',
        name: 'Dedicated Security & Engineering Partner (50 hrs/mo)',
        priceCents: 90000,
        deliveryDays: 30,
        revisions: 6,
        depositPercent: 100,
        summary: 'Fractional Head of Security & Lead Full-Stack Engineer for growing organizations.',
        features: [
          '50 dedicated hours/month across security, dev, cloud & AI',
          'Continuous VAPT, SIEM monitoring & release engineering',
          'Emergency 2h SLA & bi-weekly executive architecture review',
        ],
      },
    ],
  },
];

export type SiteConfig = typeof SITE;

export interface PortfolioCaseStudy {
  id: string;
  code: string;
  pillar: ServicePillarKey;
  pillarLabel: string;
  title: string;
  clientSector: string;
  year: string;
  headlineMetric: string;
  summary: string;
  challenge: string;
  approach: string[];
  outcomes: string[];
  stack: string[];
  relatedServiceSlug: string;
  externalUrl?: string;
}

export const PORTFOLIO_ITEMS: PortfolioCaseStudy[] = [
  {
    id: 'vapt-fintech-api',
    code: 'CS-101',
    pillar: 'cybersecurity',
    pillarLabel: 'Cybersecurity & Offensive Security',
    title: 'Web, REST API & Network Penetration Testing (VAPT)',
    clientSector: 'FinTech, SaaS & Upwork International Clients',
    year: '2024–2026',
    headlineMetric: 'OWASP Top 10 & API Security VAPT · 5.0★ Verified Upwork Security Tester',
    summary:
      'Black-box and grey-box OWASP Top 10, API Security, and Kali Linux network assessments covering authorization boundaries, session tokens, and business-logic flaws.',
    challenge:
      'Clients required independent offensive security testing across web applications, REST APIs, and perimeter networks to uncover exploitable vulnerabilities before production release.',
    approach: [
      'Executed signed Rules of Engagement (RoE) and threat-modeled multi-role authorization boundaries.',
      'Performed manual exploitation validation using Burp Suite Pro, Kali Linux, Nmap, OWASP ZAP, and Nuclei.',
      'Delivered reproducible PoC evidence, CVSS v3.1 risk scoring, and developer remediation walkthroughs.',
    ],
    outcomes: [
      'Critical and high-risk authentication and authorization flaws remediated and verified on re-test.',
      'Maintained 100% Job Success and 5.0★ client feedback across Security Tester contracts on Upwork.',
      'Delivered executive summaries alongside developer-ready patch blueprints.',
    ],
    stack: ['OWASP Top 10', 'API Security', 'Burp Suite Pro', 'Kali Linux', 'Nuclei', 'CVSS v3.1'],
    relatedServiceSlug: 'vapt-penetration-testing',
    externalUrl: 'https://www.upwork.com/freelancers/~01bd47ab2da223b848',
  },
  {
    id: 'enterprise-client-crm-portal',
    code: 'CS-102',
    pillar: 'development',
    pillarLabel: 'Full-Stack Web & Custom Software',
    title: 'Redwan.work — Full-Stack Client CRM, Order & Encrypted Vault Platform',
    clientSector: 'B2B Security & Engineering Commerce · GitHub Public Repo',
    year: '2026',
    headlineMetric: 'Next.js 16 · Supabase PostgreSQL RLS · Cloudflare R2 Encrypted Vault',
    summary:
      'Architected a full-lifecycle client relationship and service commerce platform with proposals, digital RoE sign-off, versioned R2 deliverables, and multi-currency invoicing.',
    challenge:
      'Traditional freelance workflows fragment communication, deliverables, and invoices across disconnected tools. The goal was a single, high-trust portal for taking orders, delivering sensitive security reports, and managing retainers.',
    approach: [
      'Designed a 19-migration PostgreSQL schema with strict Row-Level Security (RLS) and atomic financial stored procedures.',
      'Integrated a Cloudflare R2 Encrypted Deliverables Vault with SHA-256 checksums and audit-logged presigned downloads.',
      'Built an Antigravity-inspired Tailwind CSS v4 + Motion interface with progressive 2-phase authentication and MFA enforcement.',
    ],
    outcomes: [
      'Unified service catalog -> custom quote/order -> encrypted delivery -> invoice -> verified review pipeline.',
      'Automated unit, database, Playwright E2E, WCAG accessibility, and SEO verification gates.',
    ],
    stack: ['Next.js 16', 'TypeScript', 'Tailwind CSS v4', 'Supabase RLS', 'Cloudflare R2', 'Resend'],
    relatedServiceSlug: 'fullstack-web-development',
    externalUrl: 'https://github.com/redwan-cse/redwan.work',
  },
  {
    id: 'fast-cyber-defense-platform',
    code: 'CS-103',
    pillar: 'development',
    pillarLabel: 'Full-Stack Web & Custom Software',
    title: 'Fast Cyber Defense — Cybersecurity Agency Platform & Support Portal',
    clientSector: 'Cybersecurity Agency · Organization Repository',
    year: '2025–2026',
    headlineMetric: 'Full-Stack Agency Ecosystem · Support Portal & Zcal Booking Integration',
    summary:
      'Engineered the web platform, client support center (fcd-support), and consultation scheduling architecture for Fast Cyber Defense (fastcyberdefense.com).',
    challenge:
      'Needed a fast, conversion-focused cybersecurity agency platform paired with a dedicated support portal, granular GDPR cookie preference controls, and sticky legal/compliance documentation.',
    approach: [
      'Developed the core agency platform and fcd-support application in TypeScript and Next.js with modular UI components.',
      'Implemented interactive cookie consent management (Essential, Analytics, Marketing, Social) and sticky legal TOC navigation.',
      'Integrated consultation scheduling (fcd_zcal) and automated technical blog publishing pipelines.',
    ],
    outcomes: [
      'Launched a cohesive multi-repo agency ecosystem serving commercial cybersecurity and incident response clients.',
      'Standardized reusable legal, consent, and support UI patterns across agency properties.',
    ],
    stack: ['TypeScript', 'Next.js', 'Tailwind CSS', 'Support Portal', 'Zcal Integration', 'Cloudflare'],
    relatedServiceSlug: 'fullstack-web-development',
    externalUrl: 'https://fastcyberdefense.com',
  },
  {
    id: 'jnuits-fullstack-platform',
    code: 'CS-104',
    pillar: 'development',
    pillarLabel: 'Full-Stack Web & Custom Software',
    title: 'Jagannath University IT Society (jnuits.org.bd) — Portal & Admin Suite',
    clientSector: 'Higher Education & Student Tech Organization · Collaborator Repo',
    year: '2024–2026',
    headlineMetric: 'Full-Stack Public Portal + Dedicated Admin Panel (admin.jnuits.org.bd)',
    summary:
      'Collaborated on the full-stack web platform, static fast-load portal, and administrative management system for the 200+ member Jagannath University IT Society.',
    challenge:
      'The university IT society needed a modern digital platform to manage member registrations, workshop announcements, committee directories, and certificate verification.',
    approach: [
      'Co-developed the TypeScript full-stack portal (jnuits/jnuits-full-stack & jnuits.org.bd) and decoupled admin dashboard (admin.jnuits.org.bd).',
      'Built structured workflows for event publishing, member onboarding, and society announcements.',
      'Deployed static edge assets (static.jnuits.org.bd) for high-traffic campus recruitment drives.',
    ],
    outcomes: [
      'Streamlined digital operations and event registration for 200+ active student members and alumni.',
      'Provided long-term maintainability and role-based administration for incoming executive committees.',
    ],
    stack: ['TypeScript', 'Next.js', 'Admin RBAC', 'REST API', 'Tailwind CSS', 'GitHub Actions'],
    relatedServiceSlug: 'fullstack-web-development',
    externalUrl: 'https://jnuits.org.bd',
  },
  {
    id: 'sdgc-michigan-web-platform',
    code: 'CS-105',
    pillar: 'development',
    pillarLabel: 'Full-Stack Web & Custom Software',
    title: 'Saugatuck Douglas Garden Club (sdgc.redwan.work) — Web Platform',
    clientSector: 'Non-Profit Community Organization · Michigan, USA (Collaborator Repo)',
    year: '2026',
    headlineMetric: 'Cross-Team TypeScript Web Platform · Accessible Community Portal',
    summary:
      'Collaborated on the design and full-stack TypeScript implementation of the Saugatuck Douglas Garden Club digital platform (sdgcmich/sdgc-web).',
    challenge:
      'The organization required a clean, accessible, mobile-responsive web presence to showcase community horticulture programs, seasonal events, and member resources.',
    approach: [
      'Engineered responsive pages and reusable component layouts in TypeScript and Next.js.',
      'Calibrated typography, color contrast, and navigation clarity for diverse community demographics.',
      'Configured staging and preview deployments at sdgc.redwan.work for rapid stakeholder review.',
    ],
    outcomes: [
      'Delivered a fast, maintainable web platform simplifying event discovery and member engagement.',
      'Established clean Git collaboration workflows across contributor branches.',
    ],
    stack: ['TypeScript', 'Next.js', 'Tailwind CSS', 'Responsive UI', 'Accessibility', 'Vercel'],
    relatedServiceSlug: 'fullstack-web-development',
    externalUrl: 'https://sdgc.redwan.work/',
  },
  {
    id: 'openseo-selfhosted-cloud-stack',
    code: 'CS-106',
    pillar: 'cloud_devops',
    pillarLabel: 'Cloud, DevOps & Linux Infrastructure',
    title: 'OpenSEO — Self-Hosted SERP, Headless Chrome & AI Search Infrastructure',
    clientSector: 'Search Intelligence & Cloud Engineering · GitHub Public & Infra Repos',
    year: '2026',
    headlineMetric: '100% Self-Hosted OpenSEO · Native SearXNG + Headless Chrome + DR Backups',
    summary:
      'Built an unmetered, self-hosted SEO and SERP analysis platform integrating native SearXNG metasearch, Headless Chrome JS rendering, local Manifest AI, and encrypted disaster-recovery snapshots.',
    challenge:
      'Commercial SEO APIs impose steep per-query metering and rate limits. The objective was a 100% self-hosted stack capable of JavaScript-rendered page audits and live SERP tracking.',
    approach: [
      'Developed the TypeScript OpenSEO application (redwan-cse/open-seo) paired with containerized infrastructure (seo-platform-infra).',
      'Integrated native SearXNG SERP aggregation, Headless Chrome rendering for SPA audits, and local Manifest AI analysis.',
      'Automated encrypted disaster-recovery snapshots (seo-platform-backups) for zero-data-loss restoration.',
    ],
    outcomes: [
      'Eliminated third-party SERP API metering while supporting full JavaScript-rendered technical SEO crawls.',
      'Established reproducible container orchestration and automated encrypted backup rotation.',
    ],
    stack: ['TypeScript', 'SearXNG', 'Headless Chrome', 'Docker', 'Manifest AI', 'Encrypted Backups'],
    relatedServiceSlug: 'cloud-linux-devops',
    externalUrl: 'https://github.com/redwan-cse/open-seo',
  },
  {
    id: 'cybersecurity-sigma-falco-detection',
    code: 'CS-107',
    pillar: 'cybersecurity',
    pillarLabel: 'Cybersecurity & Offensive Security',
    title: 'Threat Models, Sigma Rules, eBPF/Falco Policies & Browser Hardening Kit',
    clientSector: 'Detection Engineering & Blue Team Research · GitHub Open Source',
    year: '2025–2026',
    headlineMetric: 'Sigma Detection Rules · Falco eBPF Policies · Windows Browser Policy Kit',
    summary:
      'Published open-source detection engineering artifacts (redwan-cse/cybersecurity-research) and PowerShell enterprise browser hardening policies (windows-browser-policy-kit).',
    challenge:
      'Modern blue teams need actionable detection-as-code rules for Active Directory, cloud workloads, and container runtimes alongside repeatable endpoint browser lockdown.',
    approach: [
      'Authored threat models, Sigma detection rules, and eBPF-based Falco runtime security policies published alongside technical articles on blogs.redwan.work.',
      'Developed PowerShell Group Policy/registry automation (windows-browser-policy-kit) for hardened Chrome, Edge, and Firefox enterprise configurations.',
      'Validated exploit paths and privilege escalation mechanics in controlled lab environments (including CVE-2023-36003 XAML diagnostics PoC analysis).',
    ],
    outcomes: [
      'Open-sourced reusable Sigma, Falco, and PowerShell hardening kits for defenders and sysadmins.',
      'Bridged offensive exploit research with practical blue-team detection engineering.',
    ],
    stack: ['Sigma Rules', 'Falco / eBPF', 'Active Directory', 'PowerShell', 'Threat Modeling', 'Blue Team'],
    relatedServiceSlug: 'siem-security-monitoring',
    externalUrl: 'https://github.com/redwan-cse/cybersecurity-research',
  },
  {
    id: 'wazuh-siem-soc',
    code: 'CS-108',
    pillar: 'cloud_devops',
    pillarLabel: 'Cloud, DevOps & Linux Infrastructure',
    title: 'Wazuh SIEM/XDR SOC Architecture & CIS Linux Fleet Hardening',
    clientSector: 'Cloud Infrastructure & Enterprise Linux Environments',
    year: '2024–2025',
    headlineMetric: 'Centralized Wazuh SIEM · CIS Ubuntu/CentOS Hardening & Active Response',
    summary:
      'Centralized Wazuh SIEM deployment with custom MITRE ATT&CK detection rules, File Integrity Monitoring (FIM), CIS Linux hardening, and automated active-response IP blocking.',
    challenge:
      'Distributed Ubuntu, CentOS, and Windows workloads lacked centralized log visibility and standardized OS hardening against credential-stuffing and unauthorized file tampering.',
    approach: [
      'Provisioned hardened Wazuh Server, Indexer, and Dashboard nodes with TLS agent enrollment.',
      'Authored custom XML decoders and rules mapped to MITRE ATT&CK techniques for SSH, Nginx, and web logs.',
      'Applied CIS-aligned Linux administration and hardening practices documented in redwan-cse/centos9-sysadmin-handbook and delivered to BTCL enterprise billing staff.',
    ],
    outcomes: [
      'Centralized real-time SSH, web, and file-integrity alerting in a unified Wazuh SOC dashboard.',
      'Enabled automated active-response blocking and standardized Linux server hardening playbooks.',
    ],
    stack: ['Wazuh SIEM', 'Ubuntu / CentOS 9', 'MITRE ATT&CK', 'Docker', 'FIM', 'CIS Hardening'],
    relatedServiceSlug: 'siem-security-monitoring',
    externalUrl: 'https://github.com/redwan-cse/centos9-sysadmin-handbook',
  },
  {
    id: 'osint-bec-fraud',
    code: 'CS-109',
    pillar: 'cybersecurity',
    pillarLabel: 'Cybersecurity & Offensive Security',
    title: 'Executive OSINT, Scam Network Attribution & BEC Fraud Investigation',
    clientSector: 'Cross-Border Commerce & Upwork Investigation Clients',
    year: '2024–2025',
    headlineMetric: 'Scam Infrastructure Attribution · Lookalike Domain Takedown & DMARC Lockdown',
    summary:
      'Conducted deep open-source intelligence (OSINT) investigations into scam websites, impersonation networks, and invoice-redirection threats for international clients.',
    challenge:
      'Clients targeted by coordinated scammer networks and typosquatted domains needed forensic attribution, infrastructure mapping, and rapid email/brand containment.',
    approach: [
      'Performed passive DNS, WHOIS/RDAP history, TLS certificate transparency, and social/handle correlation across scam networks.',
      'Enforced strict SPF, DKIM, and DMARC p=reject policies alongside account MFA and session lockdown.',
      'Compiled structured abuse dossiers for domain registrars and hosting providers to neutralize malicious infrastructure.',
    ],
    outcomes: [
      'Mapped scammer infrastructure and supported registrar abuse takedowns and executive OPSEC hardening.',
      'Maintained curated actionable OSINT methodology resources (redwan-cse/OSINT_Collection).',
    ],
    stack: ['OSINT', 'Email Forensics', 'DMARC / DKIM / SPF', 'Threat Attribution', 'Maltego', 'DNS Recon'],
    relatedServiceSlug: 'osint-threat-investigation',
    externalUrl: 'https://github.com/redwan-cse/OSINT_Collection',
  },
  {
    id: 'q1-ml-healthcare-security',
    code: 'CS-110',
    pillar: 'ai_ml',
    pillarLabel: 'Applied AI/ML & Automation',
    title: 'Published Q1 Scopus (Elsevier) & IEEE Machine Learning Pipelines',
    clientSector: 'Academic & Applied AI Security Research',
    year: '2024–2025',
    headlineMetric: 'Published in Q1 Scopus (Elsevier IJCCE) & IEEE CS BDC Symposium',
    summary:
      'Peer-reviewed machine learning research and reproducible Python pipelines covering market-segmentation clustering and feature-engineered phishing URL detection (PhishDF).',
    challenge:
      'High-stakes security and behavioral models require strong generalization alongside interpretable feature extraction that practitioners can audit and reproduce.',
    approach: [
      'Engineered end-to-end preprocessing, feature extraction, and clustering/classification benchmarking in Python and Scikit-Learn.',
      'Developed comprehensive URL lexical, host, and structural feature extraction pipelines for phishing detection (redwan-cse/PhishDF).',
      'Published peer-reviewed papers in Elsevier International Journal of Cognitive Computing in Engineering (Q1 Scopus) and IEEE CS BDC Symposium 2024.',
    ],
    outcomes: [
      'Two peer-reviewed publications with DOI/proceedings verification links on the public curriculum vitae.',
      'Applied curriculum in hands-on Machine Learning with Python training for the EDGE Project at Jagannath University.',
    ],
    stack: ['Python', 'Scikit-Learn', 'PhishDF', 'Feature Engineering', 'K-Means Clustering', 'Elsevier Q1 / IEEE'],
    relatedServiceSlug: 'ai-ml-automation',
    externalUrl: 'https://doi.org/10.1016/j.ijcce.2024.04.002',
  },
  {
    id: 'leadpilot-and-multi-cloud-bots',
    code: 'CS-111',
    pillar: 'ai_ml',
    pillarLabel: 'Applied AI/ML & Automation',
    title: 'LeadPilot-OS & Multi-Cloud Serverless Bot Automation Suite',
    clientSector: 'Workflow Automation & Serverless Engineering · GitHub Repos',
    year: '2025–2026',
    headlineMetric: 'LeadPilot-OS (leads.redwan.work) · AWS Lambda + Cloudflare Workers + Python Bots',
    summary:
      'Designed LeadPilot-OS for B2B lead intelligence alongside multi-platform serverless automation systems across AWS Lambda, DynamoDB, Cloudflare Workers, Telegram, Discord, and Zoho Mail.',
    challenge:
      'Organizations and communities needed reliable, low-cost automation for lead triage, multi-platform support bots, and scheduled communication workflows without expensive recurring SaaS overhead.',
    approach: [
      'Architected LeadPilot-OS (redwan-cse/LeadPilot-OS) in TypeScript for structured lead pipeline management.',
      'Built a multi-cloud bot automation system (multi-platform-bot-system) combining AWS Lambda, DynamoDB, Cloudflare Workers, and Google Cloud Storage within free-tier budgets.',
      'Developed Python/Telethon and Discord automation agents (telegram-daily-checkin, zoho-mail-automation, stw-owner-bot) with SOCKS5 proxy support and jitter.',
    ],
    outcomes: [
      'Automated repetitive lead, email, and community support operations across web, Telegram, and Discord.',
      'Achieved resilient serverless execution with minimal cloud infrastructure cost.',
    ],
    stack: ['TypeScript', 'Python', 'AWS Lambda', 'Cloudflare Workers', 'DynamoDB', 'Telethon / Discord.py'],
    relatedServiceSlug: 'ai-ml-automation',
    externalUrl: 'https://github.com/redwan-cse/multi-platform-bot-system',
  },
  {
    id: 'ledger-technical-publishing-stack',
    code: 'CS-112',
    pillar: 'development',
    pillarLabel: 'Full-Stack Web & Custom Software',
    title: 'Ledger Technical Publishing Theme, Django URL Service & Java eLibrary',
    clientSector: 'Open-Source Web Engineering & Academic Systems · GitHub Public Repos',
    year: '2023–2026',
    headlineMetric: 'Ledger Blogger Theme (blogs.redwan.work) · Django & Java/MySQL Systems',
    summary:
      'Created the open-source Ledger technical publishing theme for blogs.redwan.work alongside a Python/Django URL shortener web app and a collaborative Java eLibrary platform.',
    challenge:
      'Technical security publications require fast typography, syntax highlighting, and clean structured metadata, while campus utilities needed lightweight URL routing and digital library cataloging.',
    approach: [
      'Engineered redwan-cse/ledger-blogger-theme in TypeScript and SCSS with dedicated CDN asset delivery (blog-assets).',
      'Built redwan-cse/URL-Shortener-Django in Python/Django for clean link aliasing and redirect analytics.',
      'Collaborated on JnU_eLibrary (redwan-cse/JnU_eLibrary) in Java for university digital book cataloging and lending workflows.',
    ],
    outcomes: [
      'Powers technical cybersecurity research publishing at blogs.redwan.work under the PolyForm Noncommercial license.',
      'Demonstrated full-stack versatility across TypeScript, Python/Django, and Java software engineering.',
    ],
    stack: ['TypeScript', 'Python / Django', 'Java', 'SCSS', 'Technical Publishing', 'PolyForm License'],
    relatedServiceSlug: 'api-backend-engineering',
    externalUrl: 'https://github.com/redwan-cse/ledger-blogger-theme',
  },
  {
    id: 'wireguard-gateway-cloud-infra',
    code: 'CS-113',
    pillar: 'cloud_devops',
    pillarLabel: 'Cloud, DevOps & Linux Infrastructure',
    title: 'WireGuard VPS Gateway, Self-Hosted PaaS & DevOps Guidebook Architecture',
    clientSector: 'Hybrid Cloud & Self-Hosted Infrastructure · GitHub Repos',
    year: '2024–2026',
    headlineMetric: 'Home-Origin + VPS WireGuard Gateway · Docker / Coolify & CI/CD Pipelines',
    summary:
      'Designed a "Home Origin + VPS Gateway" WireGuard dumb-pipe architecture (myHomeLab), automated server backup tracking (oc-backup), and a public DevOps Guidebook.',
    challenge:
      'Self-hosting production workloads behind residential or private origins requires secure ingress tunneling, static public IP termination, and automated configuration backups without exposing internal networks.',
    approach: [
      'Engineered Shell-automated WireGuard tunnel routing between public VPS gateways and private origin servers (redwan-cse/myHomeLab).',
      'Configured automated server state and configuration backups (oc-backup) alongside Docker, Nginx, and Coolify PaaS deployments.',
      'Authored structured cloud, CI/CD, and containerization documentation in redwan-cse/DevOpsGuidebook.',
    ],
    outcomes: [
      'Enabled low-latency, DDoS-shielded public ingress to private self-hosted origins without opening local router ports.',
      'Standardized repeatable Docker + GitHub Actions deployment workflows across personal and client servers.',
    ],
    stack: ['WireGuard VPN', 'Linux Shell', 'Docker', 'Nginx', 'GitHub Actions', 'Coolify / VPS'],
    relatedServiceSlug: 'cloud-linux-devops',
    externalUrl: 'https://redwan-cse.gitbook.io/devopsguidebook/',
  },
  {
    id: 'emergency-breach-recovery',
    code: 'CS-114',
    pillar: 'tech_support',
    pillarLabel: 'Executive Tech Support & Digital Recovery',
    title: 'Compromised Account, Server & Cloud Drive Forensic Recovery (Upwork 5.0★)',
    clientSector: 'Executive Tech Support & Cloud Data Recovery · Upwork Verified',
    year: '2023–2026',
    headlineMetric: '5.0★ Upwork Verified · Google Drive / OneDrive Recovery & Breach Cleanup',
    summary:
      'Recovered hacked business/social accounts, restored permanently deleted Google Drive and OneDrive files, migrated Google Workspace drives, and cleaned compromised web servers.',
    challenge:
      'Clients faced urgent business disruption from permanently purged Google Drive folders, lost OneDrive documents, hijacked online accounts, and malware-infected web hosts.',
    approach: [
      'Executed admin-console audit trail analysis and Google Workspace / OneDrive retention recovery workflows to restore permanently deleted business files.',
      'Performed cross-tenant Google Drive migrations while preserving folder hierarchies and sharing permissions.',
      'Isolated compromised web servers, eradicated persistence backdoors, rotated credentials, and enforced MFA and WAF rules.',
    ],
    outcomes: [
      'Successfully recovered critical client Google Drive and OneDrive datasets with 5.0★ verified client reviews on Upwork ("You saved my life, high quality work").',
      'Restored compromised accounts and servers to clean, MFA-protected operational state.',
    ],
    stack: ['Google Workspace Admin', 'Cloud Data Recovery', 'Incident Response', 'Account Recovery', 'OneDrive Forensics', 'WAF Hardening'],
    relatedServiceSlug: 'executive-tech-support-recovery',
    externalUrl: 'https://www.upwork.com/freelancers/~01bd47ab2da223b848',
  },
  {
    id: 'opsec-fingerprint-proxy-engineering',
    code: 'CS-115',
    pillar: 'tech_support',
    pillarLabel: 'Executive Tech Support & Digital Recovery',
    title: 'Anti-Bot Fingerprint Isolation, SOCKS5 Proxy & ISP Network Routing (Upwork 5.0★)',
    clientSector: 'Privacy Engineering, Automation & Network Administration · Upwork Verified',
    year: '2025–2026',
    headlineMetric: '5.0★ Upwork Verified · Anti-Bot Fingerprint + SOCKS5 Proxifier + ISP Routing',
    summary:
      'Engineered anti-bot browser fingerprint isolation workflows, Windows SOCKS5 Proxifier playbooks, and cross-ISP Chromebook/network routing solutions for international clients.',
    challenge:
      'Clients required reliable browser fingerprint isolation for automated testing, leak-free SOCKS5 proxy routing on Windows, and complex cross-ISP Chromebook and network diagnostics.',
    approach: [
      'Configured anti-bot browser fingerprint profiles and task automation workflows (5.0★ Upwork contract: "Expert Needed for Fingerprint Changing with Anti-Bot Method").',
      'Authored a reusable Windows Proxifier engineering playbook (redwan-cse/proxifier-windows-playbook) covering SOCKS5 rules, proxy DNS, WPAD exclusions, and IPv6 leak prevention.',
      'Resolved cross-ISP network routing and Chromebook management challenges alongside Google Merchant and PDF automation deployments.',
    ],
    outcomes: [
      'Delivered leak-free proxy routing and anti-bot automation with 5.0★ rating ("Great working with you, solved my problem in a timely manner").',
      'Documented repeatable SOCKS5, DNS, and browser policy playbooks for rapid client deployment.',
    ],
    stack: ['Anti-Bot / Fingerprinting', 'SOCKS5 / Proxifier', 'Network Security', 'Chromebook Admin', 'DNS / IPv6 OPSEC', 'Task Automation'],
    relatedServiceSlug: 'executive-tech-support-recovery',
    externalUrl: 'https://www.upwork.com/freelancers/~01bd47ab2da223b848',
  },
];
