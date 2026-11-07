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
  name: 'Md Redwan Ahmed',
  role: 'C|EH Certified Cybersecurity Specialist, Full-Stack Engineer & Founder of Fast Cyber Defense',
  shortRole: 'C|EH Security Specialist & Full-Stack Consultant',
  tagline:
    'C|EH Certified Ethical Hacker, Full-Stack Software Engineer, Cloud/DevOps Architect, and Executive Technical Consultant delivering high-stakes offensive security, custom software, AI pipelines, and rapid incident recovery.',
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
    { code: 'C|EH', label: 'Certified Ethical Hacker (EC-Council)' },
    { code: 'CCEP', label: 'Certified Cybersecurity Educator Professional' },
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
    upwork: 'https://www.upwork.com/freelancers/redwancse',
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
    badge: 'C|EH Authorized',
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
    tagline: 'C|EH-led manual & automated offensive security assessments with executive & technical remediation reports.',
    description:
      'Comprehensive offensive security testing aligned with OWASP Top 10, OWASP API Security, and PTES. Includes signed Rules of Engagement (RoE), manual exploitation validation, PoC walkthroughs, CVSS v3.1 risk scoring, and free re-test verification.',
    requiresRoe: true,
    startingPriceCents: 45000,
    deliveryDaysMin: 5,
    deliveryDaysMax: 14,
    highlights: [
      'C|EH Certified manual exploitation & business-logic testing',
      'Executive summary + developer-ready remediation blueprint',
      'Signed Rules of Engagement (RoE) & NDA protection',
      'Complimentary post-fix verification re-test',
    ],
    packages: [
      {
        tier: 'starter',
        name: 'Starter Surface Audit',
        priceCents: 45000,
        deliveryDays: 5,
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
        priceCents: 115000,
        deliveryDays: 10,
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
        priceCents: 260000,
        deliveryDays: 16,
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
    startingPriceCents: 35000,
    deliveryDaysMin: 3,
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
        priceCents: 35000,
        deliveryDays: 3,
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
        priceCents: 85000,
        deliveryDays: 7,
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
    startingPriceCents: 50000,
    deliveryDaysMin: 4,
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
        priceCents: 50000,
        deliveryDays: 4,
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
        priceCents: 110000,
        deliveryDays: 8,
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
    startingPriceCents: 60000,
    deliveryDaysMin: 5,
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
        name: 'Feature Module / Bug & Security Fix Sprint',
        priceCents: 35000,
        deliveryDays: 4,
        revisions: 2,
        depositPercent: 50,
        summary: 'Targeted full-stack feature build, API integration, performance optimization, or bug resolution.',
        features: [
          'Up to 15 hours of senior full-stack engineering',
          'Clean TypeScript/Python PR with tests & documentation',
          'Security & performance review of touched routes',
        ],
      },
      {
        tier: 'standard',
        name: 'Production Web App / MVP Launch',
        priceCents: 140000,
        deliveryDays: 12,
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
        priceCents: 295000,
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
    startingPriceCents: 30000,
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
        priceCents: 30000,
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
        priceCents: 75000,
        deliveryDays: 6,
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
    startingPriceCents: 65000,
    deliveryDaysMin: 5,
    deliveryDaysMax: 18,
    highlights: [
      'LLM RAG pipelines, structured extraction & agent workflows',
      'Custom Python scikit-learn / PyTorch classification & anomaly models',
      'API deployment with strict rate-limiting & prompt-injection guardrails',
    ],
    packages: [
      {
        tier: 'starter',
        name: 'AI Workflow / LLM API Integration',
        priceCents: 65000,
        deliveryDays: 5,
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
        priceCents: 155000,
        deliveryDays: 14,
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
    startingPriceCents: 20000,
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
        priceCents: 20000,
        deliveryDays: 2,
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
        priceCents: 55000,
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
    ],
  },
  {
    slug: 'monthly-security-and-engineering-retainer',
    pillar: 'tech_support',
    pillarLabel: 'Executive Tech Support & Digital Recovery',
    title: 'Dedicated Monthly Security & Engineering Retainer',
    tagline: 'Your on-call C|EH Security Advisor, Full-Stack Developer & Infrastructure Guardian on a predictable monthly plan.',
    description:
      'Built for long-term client relationships. Reserve guaranteed monthly hours for continuous vulnerability monitoring, feature development, server maintenance, code reviews, and priority emergency SLA.',
    requiresRoe: false,
    startingPriceCents: 75000,
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
        priceCents: 75000,
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
        priceCents: 165000,
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
    ],
  },
];

export type SiteConfig = typeof SITE;
