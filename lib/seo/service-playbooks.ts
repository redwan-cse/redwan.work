import type { ServiceCatalogItem, ServicePillarKey } from '@/lib/content/site';
import type { FaqEntry } from '@/lib/seo/structured-data';

export interface ServiceWorkflowStep {
  phase: string;
  title: string;
  detail: string;
}

export interface ServiceSeoPlaybook {
  slug: string;
  executiveOverview: string;
  idealFor: readonly string[];
  workflowSteps: readonly ServiceWorkflowStep[];
  governanceStandards: readonly string[];
  blogKeywords: readonly string[];
  faqs: readonly FaqEntry[];
}

const SERVICE_SEO_PLAYBOOKS: Record<string, ServiceSeoPlaybook> = {
  'vapt-penetration-testing': {
    slug: 'vapt-penetration-testing',
    executiveOverview:
      'Every engagement is led directly by Md. Redwan Ahmed (EC-Council Certified Ethical Hacker #ECC8126370954, Founder & CEO of Fast Cyber Defense). Rather than handing over an unverified scanner export, testing combines targeted Burp Suite Pro interception, Kali Linux reconnaissance, manual authentication and business-logic abuse checks, and reproducible Proof-of-Concept validation so engineering teams can patch real exploit paths quickly.',
    idealFor: [
      'SaaS, FinTech, and B2B platforms preparing for production launches, enterprise procurement questionnaires, or annual security assessments.',
      'Engineering teams exposing multi-tenant REST or GraphQL APIs that need rigorous IDOR, privilege escalation, and token lifecycle validation.',
      'Organizations seeking independent black-box or grey-box testing with developer-ready patch guidance and formal verification re-testing.',
      'Founders who need clear CVSS v3.1 prioritization separating critical exploit chains from low-risk informational hardening items.',
    ],
    workflowSteps: [
      {
        phase: 'Phase 01',
        title: 'Rules of Engagement (RoE) & Threat Modeling',
        detail:
          'Define in-scope hosts, API endpoints, excluded assets, testing windows, and emergency contacts via digital RoE sign-off inside the Client Portal before any active probing begins.',
      },
      {
        phase: 'Phase 02',
        title: 'Manual Exploitation & Business-Logic Testing',
        detail:
          'Execute authenticated and unauthenticated OWASP Top 10, API Security, session management, injection, SSRF, and multi-role access control testing using Burp Suite Pro, Nuclei, and Kali Linux tooling.',
      },
      {
        phase: 'Phase 03',
        title: 'CVSS v3.1 Reporting & Remediation Blueprint',
        detail:
          'Compile an executive risk summary alongside developer-focused technical findings containing exact HTTP requests, reproduction steps, root cause analysis, and concrete code-level fix recommendations.',
      },
      {
        phase: 'Phase 04',
        title: 'Encrypted Vault Delivery & Verification Re-Test',
        detail:
          'Publish final reports into your private SHA-256 checksummed Cloudflare R2 Deliverables Vault and validate applied patches during scheduled re-testing.',
      },
    ],
    governanceStandards: [
      'Mandatory written Rules of Engagement (RoE) and NDA scope authorization prior to testing.',
      'Every finding is manually validated with reproducible PoC steps — zero raw false-positive scanner dumps.',
      'Sensitive reports and evidence artifacts are delivered exclusively through the encrypted Cloudflare R2 Vault.',
      'Structured milestone invoicing in USD, EUR, GBP, or BDT with transparent portal progress tracking.',
    ],
    blogKeywords: [
      'vapt',
      'pentest',
      'penetration',
      'owasp',
      'cve',
      'burp',
      'security',
      'vulnerability',
      'exploit',
      'api security',
      'authentication',
      'kali',
    ],
    faqs: [
      {
        id: 'svc-vapt-manual-vs-scanner',
        question: 'Is this penetration test manual or purely automated scanning?',
        answer:
          'Every VAPT engagement is manually led using Burp Suite Pro, Kali Linux, and targeted tooling. Automation assists with asset discovery and known-CVE coverage, while manual testing validates authentication flows, IDOR/BOLA boundaries, business-logic flaws, and chained exploits with zero raw scanner dumps.',
      },
      {
        id: 'svc-vapt-roe',
        question: 'What authorization is required before offensive testing starts?',
        answer:
          'Before any active scanning or exploitation begins, both parties complete written Rules of Engagement (RoE) inside the Client Portal confirming asset ownership, target URLs or IP ranges, permitted techniques, testing windows, and excluded production workflows.',
      },
      {
        id: 'svc-vapt-retest',
        question: 'How does remediation verification re-testing work after we patch vulnerabilities?',
        answer:
          'Once your developers deploy fixes for reported findings, we re-test the affected endpoints against the original proof-of-concept payloads and issue an updated verification status confirming closure or flagging residual edge cases.',
      },
      {
        id: 'svc-vapt-deliverables',
        question: 'How are sensitive penetration test reports and PoC artifacts delivered?',
        answer:
          'Reports are never emailed as unencrypted attachments. All PDFs, PoC traces, and re-test letters are stored in your private Cloudflare R2 Deliverables Vault with SHA-256 integrity checksums and audit-logged expiring download links.',
      },
    ],
  },

  'osint-threat-investigation': {
    slug: 'osint-threat-investigation',
    executiveOverview:
      'Open-source intelligence and digital fraud investigations follow strict passive collection discipline and structured evidentiary documentation. By correlating DNS history, WHOIS/registrar footprints, certificate transparency logs, exposed infrastructure, and public digital trails, this service maps threat actors and corporate exposure cleanly without crossing legal boundaries.',
    idealFor: [
      'Businesses and executives dealing with brand impersonation, phishing domains, fraudulent social profiles, or coordinated scam networks.',
      'Security leaders who need an external attack-surface inventory across subdomains, forgotten cloud buckets, and public breach exposure.',
      'Organizations assembling structured evidence packets for domain registrars, hosting abuse desks, or platform takedown submissions.',
      'Teams conducting passive pre-engagement due diligence on suspicious infrastructure, domains, or digital counterparties.',
    ],
    workflowSteps: [
      {
        phase: 'Phase 01',
        title: 'Target Intake & Legal Collection Boundaries',
        detail:
          'Confirm all known indicators (domains, handles, emails, URLs, or incident timelines) and lock investigation scope strictly to lawful passive OSINT and public infrastructure intelligence.',
      },
      {
        phase: 'Phase 02',
        title: 'Infrastructure & Footprint Correlation',
        detail:
          'Pivot across passive DNS, ASN/IP ownership, SSL certificate logs, Shodan, Maltego, SpiderFoot, and public web archives to uncover linked domains, hosting providers, and operator patterns.',
      },
      {
        phase: 'Phase 03',
        title: 'Forensic Timeline & Abuse Packet Assembly',
        detail:
          'Organize verified screenshots, DNS/WHOIS snapshots, timestamps, and relational link graphs into an objective dossier suitable for registrar abuse notices or legal review.',
      },
      {
        phase: 'Phase 04',
        title: 'Encrypted Vault Handover & Defensive Hardening',
        detail:
          'Deliver the full investigation report via the private R2 Vault alongside actionable takedown contacts and defensive exposure-reduction steps.',
      },
    ],
    governanceStandards: [
      'Strictly lawful passive OSINT methodology — zero unauthorized account intrusion or unlawful surveillance.',
      'Every indicator is archived with timestamps and reproducible source references for evidentiary reliability.',
      'Strict client confidentiality with encrypted private R2 Vault report delivery.',
      'Direct portal communication thread for rapid follow-up pivots during active impersonation cases.',
    ],
    blogKeywords: [
      'osint',
      'threat',
      'recon',
      'phishing',
      'fraud',
      'shodan',
      'dns',
      'whois',
      'investigation',
      'forensics',
      'malware',
      'security',
    ],
    faqs: [
      {
        id: 'svc-osint-lawful-methods',
        question: 'Are OSINT and digital fraud investigations conducted strictly through lawful sources?',
        answer:
          'Yes. All reconnaissance and attribution work relies strictly on publicly accessible intelligence, passive DNS/WHOIS records, certificate transparency logs, threat feeds, and lawful correlation techniques. Unauthorized intrusion into third-party accounts or private systems is never performed.',
      },
      {
        id: 'svc-osint-inputs',
        question: 'What initial evidence should I provide to start an OSINT investigation?',
        answer:
          'Provide any confirmed indicators you already have — such as impersonating domain names, phishing URLs, email headers, social handles, hosting IPs, or an incident timeline. Even a single verified domain or message header is sufficient to begin pivoting.',
      },
      {
        id: 'svc-osint-takedowns',
        question: 'Can the investigation dossier be used for registrar or hosting abuse takedowns?',
        answer:
          'Yes. Standard and Enterprise dossiers include structured registrar, hosting provider, and ASN abuse contacts paired with timestamped evidence summaries formatted to support formal abuse and takedown escalation.',
      },
      {
        id: 'svc-osint-confidentiality',
        question: 'How is sensitive investigation data protected throughout the engagement?',
        answer:
          'All client intake material, intermediate findings, and final PDF dossiers are stored inside the role-isolated Client Portal and encrypted Cloudflare R2 Vault rather than public cloud links or plain email attachments.',
      },
    ],
  },

  'siem-security-monitoring': {
    slug: 'siem-security-monitoring',
    executiveOverview:
      'Deploying Wazuh SIEM/XDR effectively requires far more than running a default installer. This engagement delivers a hardened manager, OpenSearch indexer, and dashboard architecture paired with clean Linux Auditd and Windows Sysmon telemetry, noise-reduced custom detection rules mapped to MITRE ATT&CK, File Integrity Monitoring (FIM), and high-signal alerting you own end to end.',
    idealFor: [
      'Growing engineering teams running Ubuntu, Debian, CentOS, or Windows servers that currently lack centralized security logging and intrusion detection.',
      'Organizations preparing for ISO 27001, SOC 2, or CIS benchmark reviews that require tamper-aware audit logs and File Integrity Monitoring.',
      'Security teams tired of noisy default SIEM alerts who need custom decoders, false-positive suppression, and actionable Slack, Email, or Webhook notifications.',
      'Businesses moving away from costly proprietary SIEM subscriptions toward an open-source Wazuh stack running on their own cloud or on-prem servers.',
    ],
    workflowSteps: [
      {
        phase: 'Phase 01',
        title: 'Fleet Sizing & Telemetry Architecture',
        detail:
          'Review target endpoint count, OS distribution (Ubuntu/CentOS/Windows), log retention period, and hosting environment (AWS, DigitalOcean, VPS, or on-premises) to size CPU, RAM, and storage accurately.',
      },
      {
        phase: 'Phase 02',
        title: 'Hardened Wazuh Manager, Indexer & TLS Deployment',
        detail:
          'Provision and secure the Wazuh Manager, OpenSearch Indexer, and Dashboard with TLS certificates, firewall restrictions, index lifecycle retention policies, and role-based access control.',
      },
      {
        phase: 'Phase 03',
        title: 'Agent Enrollment, FIM, Sysmon/Auditd & Rule Tuning',
        detail:
          'Enroll Linux and Windows agents, enable File Integrity Monitoring and CIS/SCA checks, configure Sysmon/Auditd pipelines, and tune custom MITRE ATT&CK rules to suppress operational noise.',
      },
      {
        phase: 'Phase 04',
        title: 'Alert Routing, Validation & Handover Runbook',
        detail:
          'Integrate Slack, email, or webhook alerting, trigger controlled test detections to verify end-to-end delivery, and provide an operations runbook covering agent onboarding and backup maintenance.',
      },
    ],
    governanceStandards: [
      'Zero vendor lock-in — your Wazuh Manager, certificates, rulesets, and OpenSearch indices live entirely on your infrastructure.',
      'Noise-tuned alert thresholds tested against realistic authentication, SSH, web, and FIM events before handover.',
      'Complete custom rule XML, decoder configurations, and operations runbook delivered in your private R2 Vault.',
      'Clear retention planning and disk-watermark safeguards to keep OpenSearch indices healthy in production.',
    ],
    blogKeywords: [
      'siem',
      'wazuh',
      'soc',
      'monitoring',
      'suricata',
      'sysmon',
      'auditd',
      'detection',
      'hardening',
      'linux',
      'incident',
      'mitre',
    ],
    faqs: [
      {
        id: 'svc-siem-sizing',
        question: 'What server resources are needed to host a production Wazuh SIEM stack?',
        answer:
          'For up to 15–25 endpoints on an all-in-one deployment, a dedicated Linux VM with 4–8 vCPU, 8–16 GB RAM, and fast SSD/NVMe storage is typically sufficient. During Phase 1 we size memory, JVM heap, and OpenSearch retention explicitly for your endpoint volume and retention window.',
      },
      {
        id: 'svc-siem-os-support',
        question: 'Which operating systems and telemetry sources can be enrolled into Wazuh?',
        answer:
          'We support Ubuntu, Debian, RHEL/CentOS/Rocky Linux, Windows Server/Workstation (with Sysmon telemetry), macOS agents, plus syslog ingestion from Nginx, firewalls, Suricata IDS, and cloud audit logs.',
      },
      {
        id: 'svc-siem-alert-fatigue',
        question: 'How do you prevent alert fatigue from noisy default SIEM rules?',
        answer:
          'After enrolling agents, we baseline normal service activity, write custom child rules and suppression filters for benign administrative events, and route only validated high-severity alerts (such as brute-force bursts, privilege escalation, or critical FIM changes) to Slack, email, or webhooks.',
      },
      {
        id: 'svc-siem-ownership',
        question: 'Do we keep full administrative control after Wazuh deployment is complete?',
        answer:
          'Yes. Everything is deployed on your cloud or on-premises infrastructure with zero recurring license lock-in. You receive full admin credentials, custom XML rule definitions, index retention policies, and a concise runbook for adding future agents.',
      },
    ],
  },

  'fullstack-web-development': {
    slug: 'fullstack-web-development',
    executiveOverview:
      'Modern web platforms fail most often at the intersection of authorization, data integrity, and operational performance. Every application is engineered with Next.js App Router, strict TypeScript, PostgreSQL/Supabase Row-Level Security (RLS), and security-by-design controls — drawing directly from production architecture patterns like the redwan.work CRM and encrypted vault platform.',
    idealFor: [
      'Founders and agencies building client portals, SaaS MVPs, booking/order workflows, or internal CRM dashboards that handle sensitive customer data.',
      'Teams upgrading legacy sites to fast, SEO-ready Next.js + Tailwind CSS v4 architectures with clean Core Web Vitals and structured data.',
      'Businesses needing database-enforced multi-tenant authorization (PostgreSQL RLS), atomic transactional logic, and secure Cloudflare R2 / S3 file workflows.',
      'Organizations wanting clean, documented TypeScript codebases shipped with automated tests and reproducible Vercel or Docker deployments.',
    ],
    workflowSteps: [
      {
        phase: 'Phase 01',
        title: 'Product Architecture & PostgreSQL Schema Design',
        detail:
          'Map user roles, data relationships, Row-Level Security (RLS) policies, API contracts, and milestone deliverables before writing production UI code.',
      },
      {
        phase: 'Phase 02',
        title: 'Full-Stack Implementation & Security Controls',
        detail:
          'Build responsive Next.js / TypeScript interfaces, server-side Zod input validation, authentication/MFA flows, private R2 file storage, and transactional email pipelines.',
      },
      {
        phase: 'Phase 03',
        title: 'End-to-End Verification, SEO & Accessibility Checks',
        detail:
          'Validate type safety, linting, critical user flows, metadata/structured data, mobile responsiveness, and WCAG accessibility across staging environments.',
      },
      {
        phase: 'Phase 04',
        title: 'Production Deployment & Complete Source Handover',
        detail:
          'Deploy to Vercel, Cloudflare, or Docker/Linux infrastructure, verify environment variables and health checks, and transfer full Git repository ownership and documentation.',
      },
    ],
    governanceStandards: [
      'Strict TypeScript, server-side Zod validation, and database-enforced PostgreSQL RLS by default.',
      'Zero proprietary lock-in — you own 100% of the Git repository, SQL migrations, and deployment configuration.',
      'Built-in technical SEO fundamentals: clean semantic HTML, canonical URLs, JSON-LD, and fast SSR.',
      'Milestone-gated delivery inside the Client Portal with structured revision rounds.',
    ],
    blogKeywords: [
      'next.js',
      'nextjs',
      'typescript',
      'react',
      'supabase',
      'postgres',
      'postgresql',
      'full-stack',
      'web',
      'django',
      'tailwind',
      'portal',
    ],
    faqs: [
      {
        id: 'svc-fullstack-ownership',
        question: 'Do I receive full source code and repository ownership upon completion?',
        answer:
          'Yes. All custom application code, SQL migrations, environment templates, and deployment scripts are delivered cleanly in your Git repository with full intellectual property ownership upon milestone completion.',
      },
      {
        id: 'svc-fullstack-security',
        question: 'How is application security built into full-stack projects from day one?',
        answer:
          'Every project applies security-by-design practices: strict server-side input validation with Zod, PostgreSQL Row-Level Security (RLS) policies for role isolation, hardened security headers (CSP/HSTS), and safe presigned storage URLs for private files.',
      },
      {
        id: 'svc-fullstack-hosting',
        question: 'Where can the finished web application be deployed?',
        answer:
          'Applications are commonly deployed on Vercel + Supabase + Cloudflare R2 for minimal operational overhead, or containerized with Docker and Nginx on your own AWS, DigitalOcean, or private Linux server.',
      },
      {
        id: 'svc-fullstack-revisions',
        question: 'How are scope milestones and revisions managed during development?',
        answer:
          'Each package tier includes defined delivery timelines, staging previews, and structured revision rounds tracked directly inside the Client Portal so you can inspect working features before signing off on final milestones.',
      },
    ],
  },

  'api-backend-engineering': {
    slug: 'api-backend-engineering',
    executiveOverview:
      'Broken webhooks, fragile authentication flows, slow SQL queries, and tangled backend integrations quietly stall product velocity and create security vulnerabilities. This service delivers targeted root-cause debugging, hardened REST/webhook API engineering, and clean refactoring across Node.js/TypeScript, Python, PostgreSQL, and third-party payment or storage pipelines.',
    idealFor: [
      'Product teams dealing with urgent production bugs, race conditions, broken auth/session tokens, or failing third-party webhook integrations.',
      'Startups needing reliable Cloudflare R2/S3 presigned upload pipelines, Resend transactional email outboxes, or Stripe/payment webhook handlers.',
      'Engineering leads who need an existing Node.js, TypeScript, Python/Django, or PHP backend stabilized, secured, and covered with integration tests.',
      'Teams migrating legacy API endpoints to strict schema validation, rate limiting, and atomic database transactions.',
    ],
    workflowSteps: [
      {
        phase: 'Phase 01',
        title: 'Codebase Audit & Root-Cause Reproduction',
        detail:
          'Inspect repository code, logs, database queries, and failing payloads to isolate exact root causes rather than applying fragile surface patches.',
      },
      {
        phase: 'Phase 02',
        title: 'Clean Implementation & Defensive Guardrails',
        detail:
          'Implement clean API handlers, Zod/schema validation, webhook signature verification, idempotency keys, rate limiting, and atomic SQL transactions.',
      },
      {
        phase: 'Phase 03',
        title: 'Automated Integration Testing & Security Check',
        detail:
          'Write reproducible unit or integration tests covering happy paths, authorization checks, malformed inputs, and failure recovery.',
      },
      {
        phase: 'Phase 04',
        title: 'Pull Request Review & Deployment Verification',
        detail:
          'Deliver a clean, reviewable Pull Request with step-by-step verification notes and confirm healthy production behavior after rollout.',
      },
    ],
    governanceStandards: [
      'All fixes are delivered as clean, diff-reviewable Pull Requests — never opaque untracked server hotfixes.',
      'Every webhook and mutation endpoint enforces signature checks, input schemas, and fail-closed authorization.',
      'Database changes use deterministic, versioned migrations preserving existing production data.',
      'Scoped transparently with Starter rapid-patch and Standard full-module tiers.',
    ],
    blogKeywords: [
      'api',
      'backend',
      'webhook',
      'node',
      'typescript',
      'python',
      'postgres',
      'sql',
      'jwt',
      'auth',
      'rest',
      'r2',
    ],
    faqs: [
      {
        id: 'svc-api-stacks',
        question: 'Which backend languages, frameworks, and databases do you support?',
        answer:
          'Primary backend stacks include TypeScript/Node.js (Next.js Route Handlers, Express), Python (Django, FastAPI), PostgreSQL/Supabase, MySQL, Cloudflare R2/S3 object storage, and modern REST/webhook integrations.',
      },
      {
        id: 'svc-api-access',
        question: 'How do you access our codebase and staging environment safely?',
        answer:
          'Work is performed via least-privilege Git repository access and staging credentials shared securely through the Client Portal. Production secrets are never committed to Git or shared in plain text.',
      },
      {
        id: 'svc-api-webhooks',
        question: 'Can you fix unreliable webhooks, duplicate events, or silent background failures?',
        answer:
          'Yes. Common backend rescue tasks include adding cryptographic webhook signature verification, idempotency guards, durable database outbox queues with retry backoff, and structured error logging.',
      },
      {
        id: 'svc-api-testing',
        question: 'Will my bug fix or new API module include verification tests?',
        answer:
          'Yes. Targeted bug fixes include clear reproduction and verification steps, and custom backend modules ship with automated tests confirming authorization boundaries, input validation, and expected API contracts.',
      },
    ],
  },

  'cloud-linux-devops': {
    slug: 'cloud-linux-devops',
    executiveOverview:
      'Production uptime and infrastructure security start at the operating system and deployment pipeline. Drawing on hands-on Ubuntu/CentOS Linux server administration, Nginx reverse-proxy engineering, Docker containerization, Cloudflare edge hardening, and GitHub Actions CI/CD, this service turns fragile manual servers into repeatable, hardened production environments.',
    idealFor: [
      'Teams launching applications on AWS, Azure, DigitalOcean, or bare-metal Linux VPS instances who need CIS-aligned SSH, firewall, and TLS hardening.',
      'Engineering groups migrating away from manual FTP/SSH deployments toward multi-stage Docker containers and automated GitHub Actions CI/CD.',
      'Organizations needing Nginx reverse-proxy tuning, Cloudflare DNS/WAF/origin shielding, and automated encrypted off-site database backups.',
      'Businesses planning zero-downtime server migrations without breaking SSL certificates, email DNS records, or active traffic.',
    ],
    workflowSteps: [
      {
        phase: 'Phase 01',
        title: 'Infrastructure Audit & Architecture Blueprint',
        detail:
          'Review existing hosting topology, DNS records, open ports, backup posture, and deployment friction to design a clean target state with zero surprises.',
      },
      {
        phase: 'Phase 02',
        title: 'OS Hardening, Networking & Reverse Proxy Setup',
        detail:
          'Configure key-only SSH, UFW/firewall rules, Fail2ban, kernel security defaults, Nginx TLS reverse proxies, and Cloudflare origin protection.',
      },
      {
        phase: 'Phase 03',
        title: 'Dockerization, CI/CD & Automated Backups',
        detail:
          'Containerize workloads with multi-stage Dockerfiles, wire GitHub Actions test/build/deploy pipelines with clean secrets management, and schedule verified off-site backups.',
      },
      {
        phase: 'Phase 04',
        title: 'Cutover Verification & Infrastructure Documentation',
        detail:
          'Verify TLS grades, backup restore drills, rollback commands, and hand over a clear infrastructure runbook inside your private R2 Vault.',
      },
    ],
    governanceStandards: [
      'Least-privilege IAM and SSH key-only access — password-based root SSH is disabled by default.',
      'Zero-downtime cutover planning with explicit rollback checkpoints before DNS or proxy switches.',
      'Automated backup scripts verified with actual restore checks rather than untested cron jobs.',
      'Every Dockerfile, Nginx config, and GitHub Actions workflow is version-controlled in your repository.',
    ],
    blogKeywords: [
      'linux',
      'ubuntu',
      'centos',
      'docker',
      'nginx',
      'cloud',
      'aws',
      'azure',
      'devops',
      'ci/cd',
      'github actions',
      'cloudflare',
      'jenkins',
      'server',
    ],
    faqs: [
      {
        id: 'svc-cloud-providers',
        question: 'Which cloud providers and Linux distributions are supported?',
        answer:
          'Engagements cover Ubuntu LTS, Debian, Rocky/CentOS Linux across AWS, Azure, DigitalOcean, Hetzner, Linode, Cloudflare, and private VPS or on-premises virtual machines.',
      },
      {
        id: 'svc-cloud-downtime',
        question: 'Will server hardening or cloud migration take our live site offline?',
        answer:
          'Migrations and proxy reconfigurations are planned for zero or near-zero downtime by staging the target environment in parallel, pre-validating TLS and environment variables, and executing a controlled DNS/upstream switch with a tested rollback path.',
      },
      {
        id: 'svc-cloud-backups',
        question: 'Are automated database and file backups included in Linux hardening?',
        answer:
          'Yes. Starter and Standard packages include automated scheduled database and configuration backups to off-site object storage (such as Cloudflare R2 or S3) along with documented restoration steps.',
      },
      {
        id: 'svc-cloud-cicd',
        question: 'Can you set up GitHub Actions CI/CD with staging and production gates?',
        answer:
          'Yes. We build deterministic GitHub Actions workflows that run linting, typechecks, and test suites before building Docker images or triggering deployments with properly scoped environment secrets.',
      },
    ],
  },

  'ai-ml-automation': {
    slug: 'ai-ml-automation',
    executiveOverview:
      'Grounded in peer-reviewed Q1 Scopus machine learning research (International Journal of Cognitive Computing in Engineering, Elsevier) and IEEE CS BDC Symposium work, this service focuses on practical, measurable Python ML pipelines and production AI automations — from phishing and anomaly classification models to structured LLM workflow integrations with clear evaluation metrics.',
    idealFor: [
      'Teams needing supervised classification, phishing/fraud detection, or anomaly-scoring models built in Python with reproducible evaluation benchmarks.',
      'Businesses looking to integrate LLM APIs into document triage, structured data extraction, or support/operations automation with strict guardrails.',
      'Data and engineering teams wanting messy raw CSV/JSON/log datasets cleaned into repeatable feature-engineering and training pipelines.',
      'Organizations that need trained models wrapped cleanly behind typed FastAPI/Node endpoints rather than abandoned notebooks.',
    ],
    workflowSteps: [
      {
        phase: 'Phase 01',
        title: 'Problem Framing, Dataset Audit & Metric Selection',
        detail:
          'Evaluate dataset quality, class balance, leakage risks, privacy boundaries, and business success metrics (precision, recall, F1, latency, or cost per run) before model selection.',
      },
      {
        phase: 'Phase 02',
        title: 'Feature Engineering, Training & Validation',
        detail:
          'Build clean preprocessing pipelines, run cross-validated baseline and ensemble experiments in Python/Scikit-Learn or configure deterministic LLM prompts and structured schemas.',
      },
      {
        phase: 'Phase 03',
        title: 'API Wrapper, Guardrails & Automation Integration',
        detail:
          'Package the validated model or AI workflow into a production-ready Python/TypeScript service with input validation, fallback handling, and rate/cost controls.',
      },
      {
        phase: 'Phase 04',
        title: 'Reproducible Codebase & Evaluation Report Handover',
        detail:
          'Deliver training scripts, model artifacts, evaluation metrics, and usage documentation cleanly through Git and your encrypted R2 Deliverables Vault.',
      },
    ],
    governanceStandards: [
      'Honest quantitative evaluation reporting (precision, recall, F1, confusion matrices, and failure modes) — zero inflated accuracy claims.',
      'Strict data privacy: client datasets are never shared with unauthorized third parties or public training pools.',
      'Reproducible pinned Python environments and versioned codebases — no fragile unrepeatable notebooks.',
      'Practical LLM integrations enforce structured JSON schemas, prompt-injection mitigations, and cost budgets.',
    ],
    blogKeywords: [
      'ai',
      'ml',
      'machine learning',
      'llm',
      'python',
      'phishing',
      'classification',
      'automation',
      'model',
      'nlp',
      'data',
      'scikit',
    ],
    faqs: [
      {
        id: 'svc-aiml-data-privacy',
        question: 'How is our proprietary dataset handled during ML model development?',
        answer:
          'Client datasets are transferred through the encrypted Client Portal/R2 Vault, processed strictly within isolated environments for your project, and never reused to train external or third-party models.',
      },
      {
        id: 'svc-aiml-classical-vs-llm',
        question: 'How do you choose between classical Machine Learning and LLM API workflows?',
        answer:
          'When you have structured tabular/log data requiring fast, deterministic, low-cost predictions (such as phishing detection or fraud scoring), classical ML models (Scikit-Learn/ensemble methods) usually outperform LLMs. When tasks involve unstructured text synthesis or multi-step tool orchestration, schema-validated LLM workflows are used.',
      },
      {
        id: 'svc-aiml-deployment',
        question: 'Do you only deliver a Jupyter notebook, or can you deploy an API endpoint?',
        answer:
          'Every engagement delivers clean, reproducible Python scripts and can wrap the trained model or automation workflow behind a deployable REST API (FastAPI/Node.js) or scheduled script ready for your application stack.',
      },
      {
        id: 'svc-aiml-evaluation',
        question: 'How do we know the model actually performs reliably before launching?',
        answer:
          'You receive a transparent evaluation summary documenting train/validation splits, precision, recall, F1-score, error analysis, and edge-case behavior on holdout samples so deployment decisions are backed by evidence.',
      },
    ],
  },

  'executive-tech-support-recovery': {
    slug: 'executive-tech-support-recovery',
    executiveOverview:
      'When a business domain, cloud workspace, Linux server, or executive account is compromised — or critical DNS, email deliverability, or operational systems break under time pressure — calm, forensic execution matters. This service provides rapid hands-on containment, authorized account and cloud file recovery, malware eradication, and post-incident hardening to stop repeat compromise.',
    idealFor: [
      'Founders, agencies, and executives responding to compromised Google Workspace, Microsoft 365, business email, social, or cloud accounts.',
      'Site owners facing hacked WordPress/Linux servers, malicious backdoors, unauthorized redirects, or blacklisted domains needing forensic cleanup and lockdown.',
      'Teams experiencing urgent broken email deliverability (SPF, DKIM, DMARC, MX misconfigurations), SSL failures, or cloud permission lockouts.',
      'Clients needing confidential OPSEC hardening, MFA/passkey migration, session revocation, and isolated browser/proxy environment configuration.',
    ],
    workflowSteps: [
      {
        phase: 'Phase 01',
        title: 'Urgent Triage & Containment Assessment',
        detail:
          'Verify asset ownership, document active symptoms and compromise vectors, revoke rogue sessions/OAuth tokens, and stop ongoing attacker persistence immediately.',
      },
      {
        phase: 'Phase 02',
        title: 'Forensic Cleanup & Authorized Recovery Execution',
        detail:
          'Remove malicious webshells, rogue cron jobs, or unauthorized forwarding rules; restore deleted Google Workspace/OneDrive/server files; or execute structured platform recovery escalations.',
      },
      {
        phase: 'Phase 03',
        title: 'Credential Rotation & Post-Incident Lockdown',
        detail:
          'Rotate compromised secrets and SSH/API keys, enforce phishing-resistant MFA, harden WAF/firewall rules, and lock down domain email authentication (SPF, DKIM, DMARC).',
      },
      {
        phase: 'Phase 04',
        title: 'Incident Summary & Prevention Checklist',
        detail:
          'Deliver a plain-English root-cause summary, verification log, and repeatable security checklist inside your encrypted Client Portal Vault.',
      },
    ],
    governanceStandards: [
      'Strict ownership verification and authorized recovery workflows — zero unauthorized hacking or gray-market tactics.',
      'Confidential incident handling with encrypted credential/evidence transfer inside the private Client Portal.',
      'Every recovery engagement pairs immediate cleanup with root-cause hardening to prevent re-infection.',
      'Clear fixed-scope Starter, Standard, and Enterprise tiers with predictable kickoff and turnaround timelines.',
    ],
    blogKeywords: [
      'recovery',
      'incident',
      'malware',
      'breach',
      'hardening',
      'dns',
      'dmarc',
      'spf',
      'opsec',
      'linux',
      'wordpress',
      'security',
    ],
    faqs: [
      {
        id: 'svc-recovery-eligibility',
        question: 'What proof of ownership is required for account or server recovery?',
        answer:
          'Recovery and forensic remediation are performed strictly for legitimate account, domain, or server owners. We verify ownership through domain DNS records, billing/registrar documentation, or authorized administrative access before initiating recovery steps.',
      },
      {
        id: 'svc-recovery-email-dns',
        question: 'Can you fix hacked business email forwarding rules and SPF/DKIM/DMARC issues?',
        answer:
          'Yes. Post-compromise email recovery includes auditing hidden inbox forwarding rules, revoking unauthorized OAuth apps and active sessions, rotating credentials, enforcing MFA, and configuring strict SPF, DKIM, and DMARC DNS records.',
      },
      {
        id: 'svc-recovery-malware',
        question: 'How do you make sure a hacked server or website does not get re-infected?',
        answer:
          'Instead of merely deleting visible malicious files, we inspect persistence mechanisms (cron jobs, SSH authorized_keys, web backdoors, rogue admin users, and vulnerable plugins), rotate all database and API secrets, patch the entry vector, and harden firewall/WAF rules.',
      },
      {
        id: 'svc-recovery-speed',
        question: 'How quickly can an urgent troubleshooting or incident recovery session begin?',
        answer:
          'Starter troubleshooting sessions target turnaround within 2 days, and Standard incident recovery begins triage immediately upon scope confirmation and kickoff inside the Client Portal. For urgent ongoing coverage, priority SLA retainers are also available.',
      },
    ],
  },

  'monthly-security-and-engineering-retainer': {
    slug: 'monthly-security-and-engineering-retainer',
    executiveOverview:
      'Rather than scrambling to hire different contractors every time a vulnerability alert fires, a server needs patching, or a high-priority feature ships, a dedicated monthly retainer gives your organization continuous access to one accountable Security Advisor and Full-Stack/Cloud Architect across all five engineering pillars.',
    idealFor: [
      'Startups and agencies that want a fractional Head of Security and Lead Full-Stack Engineer on a predictable monthly budget.',
      'Organizations running production web apps and Linux infrastructure that require monthly patching, vulnerability checks, and code security reviews.',
      'Teams shipping regular product releases who want priority PR reviews, CI/CD upkeep, and rapid incident response SLA.',
      'Long-term partners seeking direct Client Portal ticket priority and monthly technical architecture planning.',
    ],
    workflowSteps: [
      {
        phase: 'Phase 01',
        title: 'Baseline Audit & Retainer Onboarding',
        detail:
          'Inventory covered repositories, servers, domains, and escalation contacts, and establish your Client Portal priority ticket lane and monthly cadence.',
      },
      {
        phase: 'Phase 02',
        title: 'Continuous Patching, Monitoring & Feature Shipping',
        detail:
          'Allocate reserved monthly hours fluidly across security reviews, vulnerability validation, full-stack feature development, API fixes, and DevOps upkeep.',
      },
      {
        phase: 'Phase 03',
        title: 'Priority Incident & Troubleshooting SLA',
        detail:
          'Receive guaranteed fast-track response times for urgent outages, suspicious security alerts, or critical release blockers.',
      },
      {
        phase: 'Phase 04',
        title: 'Monthly Health Report & Next-Month Roadmap',
        detail:
          'Review completed tasks, logged hours, security health findings, and upcoming priorities in a concise monthly executive report inside your portal.',
      },
    ],
    governanceStandards: [
      'Flexible cross-pillar hours covering security, full-stack development, cloud DevOps, AI automation, and tech support.',
      'Transparent monthly time & deliverable reporting logged directly inside your Client Portal.',
      'Predictable recurring monthly invoicing in USD, EUR, GBP, or BDT with no surprise emergency surcharges.',
      'Dedicated encrypted R2 Vault archive for all monthly audit reports and architecture notes.',
    ],
    blogKeywords: [
      'security',
      'hardening',
      'devops',
      'linux',
      'next.js',
      'siem',
      'vapt',
      'monitoring',
      'architecture',
    ],
    faqs: [
      {
        id: 'svc-retainer-flexibility',
        question: 'Can monthly retainer hours be used across both cybersecurity and software development?',
        answer:
          'Yes. Reserved monthly hours can be allocated flexibly across penetration testing checks, SIEM tuning, Next.js/API development, Linux/Cloud maintenance, and urgent technical troubleshooting depending on your priorities each month.',
      },
      {
        id: 'svc-retainer-sla',
        question: 'What response SLA is included with a monthly retainer?',
        answer:
          'Essential Care (10 hrs/mo) includes <12-hour priority ticket SLA, Growth Partner (25 hrs/mo) includes <4-hour VIP SLA plus a monthly strategy call, and Dedicated Partner (50 hrs/mo) includes a 2-hour emergency SLA and bi-weekly architecture reviews.',
      },
      {
        id: 'svc-retainer-tracking',
        question: 'How are retainer hours and monthly deliverables tracked?',
        answer:
          'All requests, status updates, logged hours, and monthly health reports are managed transparently inside your Client Portal with automated billing history and encrypted deliverable archives.',
      },
      {
        id: 'svc-retainer-commitment',
        question: 'Are monthly retainers locked into long-term annual contracts?',
        answer:
          'No. Retainers operate on straightforward monthly billing cycles so you can scale hours up ahead of major product launches or pause cleanly with advance notice before the next renewal cycle.',
      },
    ],
  },
};

const PILLAR_FALLBACK_KEYWORDS: Record<ServicePillarKey, readonly string[]> = {
  cybersecurity: ['security', 'vapt', 'owasp', 'cve', 'siem', 'osint', 'hardening'],
  development: ['next.js', 'typescript', 'react', 'postgres', 'api', 'web', 'supabase'],
  cloud_devops: ['linux', 'docker', 'nginx', 'cloud', 'devops', 'ci/cd', 'cloudflare'],
  ai_ml: ['ai', 'ml', 'machine learning', 'python', 'llm', 'automation', 'phishing'],
  tech_support: ['recovery', 'incident', 'hardening', 'dns', 'opsec', 'linux', 'security'],
};

export function getServiceSeoPlaybook(
  service: Pick<
    ServiceCatalogItem,
    'slug' | 'title' | 'pillar' | 'pillarLabel' | 'requiresRoe' | 'deliveryDaysMin' | 'deliveryDaysMax'
  >
): ServiceSeoPlaybook {
  const exact = SERVICE_SEO_PLAYBOOKS[service.slug];
  if (exact) {
    return exact;
  }

  return {
    slug: service.slug,
    executiveOverview: `${service.title} is delivered directly by Md. Redwan Ahmed under the ${service.pillarLabel} practice. Every engagement follows a transparent milestone workflow with clear technical scope, security-first execution, and direct communication inside the private Client Portal.`,
    idealFor: [
      `Organizations seeking senior hands-on execution in ${service.pillarLabel} without agency handoffs.`,
      'Teams requiring fixed-scope deliverables, clear timelines, and verifiable technical outcomes.',
      'Businesses handling sensitive infrastructure, repositories, or customer data that demand strict confidentiality.',
      'Founders and engineering leads looking for clean documentation and post-delivery handover support.',
    ],
    workflowSteps: [
      {
        phase: 'Phase 01',
        title: service.requiresRoe
          ? 'Scope Alignment & Written Rules of Engagement'
          : 'Scope Alignment & Technical Discovery',
        detail: service.requiresRoe
          ? 'Confirm asset ownership, technical boundaries, and written RoE authorization inside the Client Portal prior to execution.'
          : 'Review existing architecture, goals, access requirements, and milestone acceptance criteria before kickoff.',
      },
      {
        phase: 'Phase 02',
        title: 'Hands-On Engineering & Security Execution',
        detail: `Execute core deliverables for ${service.title} with disciplined testing, clean documentation, and progress visibility.`,
      },
      {
        phase: 'Phase 03',
        title: 'Verification, Review & Revisions',
        detail:
          'Walk through completed deliverables against agreed acceptance criteria and apply included revision refinements.',
      },
      {
        phase: 'Phase 04',
        title: 'Encrypted Vault Handover & Sign-Off',
        detail:
          'Publish final documentation, artifacts, and runbooks to your private SHA-256 checksummed Cloudflare R2 Deliverables Vault.',
      },
    ],
    governanceStandards: [
      service.requiresRoe
        ? 'Written Rules of Engagement (RoE) and NDA scope authorization enforced before active testing.'
        : 'NDA-protected scope confirmation and least-privilege credential handling throughout the engagement.',
      'All final reports and artifacts are delivered through the private Cloudflare R2 Deliverables Vault.',
      `Typical delivery window of ${service.deliveryDaysMin}–${service.deliveryDaysMax} days depending on selected package tier.`,
      'Milestone-based invoicing supported in USD, EUR, GBP, and BDT.',
    ],
    blogKeywords: PILLAR_FALLBACK_KEYWORDS[service.pillar] ?? ['security', 'engineering'],
    faqs: [
      {
        id: `svc-${service.slug}-kickoff`,
        question: `How do I start a ${service.title} engagement?`,
        answer:
          'Select a fixed-scope package tier directly through the Client Portal or submit custom project requirements via /contact to receive a structured milestone proposal before any payment is requested.',
      },
      {
        id: `svc-${service.slug}-timeline`,
        question: `How long does ${service.title} typically take?`,
        answer: `Standard fixed-scope tiers run between ${service.deliveryDaysMin} and ${service.deliveryDaysMax} days from kickoff, depending on scope complexity and target environment readiness.`,
      },
      {
        id: `svc-${service.slug}-delivery`,
        question: 'How are completed deliverables and technical reports shared safely?',
        answer:
          'All deliverables, technical documentation, and audit evidence are uploaded to your private Cloudflare R2 Deliverables Vault with SHA-256 checksum verification and expiring authenticated download links.',
      },
    ],
  };
}
