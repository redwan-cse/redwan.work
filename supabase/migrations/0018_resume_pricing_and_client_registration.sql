-- 0018_resume_pricing_and_client_registration.sql
-- 1. Updates Starter / Basic service package pricing to accessible South Asian freelancer rates
--    and ensures all 3 tiers (Starter, Standard, Enterprise) exist on every service.
-- 2. Populates complete verified Resume / CV items and site_settings fields.

do $$
declare
  v_svc record;
begin
  -- Update starting prices on services
  update public.services set starting_price_cents = 12000 where slug = 'vapt-penetration-testing';
  update public.services set starting_price_cents = 8000 where slug = 'osint-threat-investigation';
  update public.services set starting_price_cents = 14000 where slug = 'siem-security-monitoring';
  update public.services set starting_price_cents = 12000 where slug = 'fullstack-web-development';
  update public.services set starting_price_cents = 7500 where slug = 'api-backend-engineering';
  update public.services set starting_price_cents = 8000 where slug = 'cloud-linux-devops';
  update public.services set starting_price_cents = 15000 where slug = 'ai-ml-automation';
  update public.services set starting_price_cents = 5000 where slug = 'executive-tech-support-recovery';

  -- Ensure all 3 tiers exist and have calibrated Starter rates for each service
  for v_svc in select id, slug from public.services loop
    if v_svc.slug = 'vapt-penetration-testing' then
      insert into public.service_packages (service_id, tier_name, package_name, summary, price_cents, deposit_percent, delivery_days, revisions_included, is_popular, features, sort_order)
      values
        (v_svc.id, 'Starter', 'Starter Surface Audit', 'Single web app or API surface (up to 15 endpoints) OWASP Top 10 assessment.', 12000, 50, 4, 1, false,
         '["OWASP Top 10 & auth session testing", "CVSS-scored PDF findings report", "1 round of post-fix re-testing"]'::jsonb, 1),
        (v_svc.id, 'Standard', 'Full-Scope VAPT + Re-Test', 'Deep manual penetration test across web app, API, and cloud perimeter.', 120000, 50, 8, 2, true,
         '["Deep manual business-logic & privilege escalation testing", "Full PoC exploit evidence + remediation walkthrough call", "2 rounds of verification re-testing + Security Certificate"]'::jsonb, 2),
        (v_svc.id, 'Enterprise', 'Enterprise Red-Team & Compliance Suite', 'Multi-environment Web + API + Cloud + Infrastructure offensive security engagement.', 240000, 40, 14, 3, false,
         '["Multi-app, API, cloud IAM & network perimeter assessment", "SOC2 / ISO 27001 / HIPAA audit-ready reporting package", "30-day post-assessment engineering advisory"]'::jsonb, 3)
      on conflict (service_id, tier_name) do update set
        package_name = excluded.package_name,
        summary = excluded.summary,
        price_cents = excluded.price_cents,
        deposit_percent = excluded.deposit_percent,
        delivery_days = excluded.delivery_days,
        revisions_included = excluded.revisions_included,
        is_popular = excluded.is_popular,
        features = excluded.features,
        sort_order = excluded.sort_order;

    elsif v_svc.slug = 'osint-threat-investigation' then
      insert into public.service_packages (service_id, tier_name, package_name, summary, price_cents, deposit_percent, delivery_days, revisions_included, is_popular, features, sort_order)
      values
        (v_svc.id, 'Starter', 'Starter Recon & Exposure Scan', 'Targeted OSINT reconnaissance on 1 brand, domain, or threat handle.', 8000, 50, 3, 1, false,
         '["Domain, subdomain, DNS & leaked credential footprint", "Social & impersonation account mapping", "Structured OSINT summary report"]'::jsonb, 1),
        (v_svc.id, 'Standard', 'Full Fraud & Threat Actor Dossier', 'Deep-dive investigation into scammer networks, phishing infrastructure, and digital trail.', 22000, 50, 5, 2, true,
         '["Maltego & Shodan infrastructure correlation", "Scam/phishing network attribution & hosting trace", "Actionable takedown & abuse-reporting dossier"]'::jsonb, 2),
        (v_svc.id, 'Enterprise', 'Enterprise Threat Intelligence & Brand Takedown', 'Comprehensive multi-domain brand protection, dark-web monitoring, and registrar takedown coordination.', 48000, 50, 7, 3, false,
         '["Multi-domain & executive VIP exposure audit", "Registrar/hosting abuse escalation & takedown tracking", "30-day post-investigation threat monitoring"]'::jsonb, 3)
      on conflict (service_id, tier_name) do update set
        package_name = excluded.package_name,
        summary = excluded.summary,
        price_cents = excluded.price_cents,
        deposit_percent = excluded.deposit_percent,
        delivery_days = excluded.delivery_days,
        revisions_included = excluded.revisions_included,
        is_popular = excluded.is_popular,
        features = excluded.features,
        sort_order = excluded.sort_order;

    elsif v_svc.slug = 'siem-security-monitoring' then
      insert into public.service_packages (service_id, tier_name, package_name, summary, price_cents, deposit_percent, delivery_days, revisions_included, is_popular, features, sort_order)
      values
        (v_svc.id, 'Starter', 'Starter Wazuh Node + 5 Agents', 'Single Wazuh manager installation with up to 5 monitored Linux/Windows endpoints.', 14000, 50, 4, 1, false,
         '["Hardened Wazuh Manager & Dashboard setup", "Up to 5 endpoint agents + File Integrity Monitoring", "Email/Slack critical alert integration"]'::jsonb, 1),
        (v_svc.id, 'Standard', 'Wazuh SIEM Deployment + 15 Agents', 'Complete Wazuh manager cluster + up to 15 monitored endpoints.', 32000, 50, 6, 2, true,
         '["Hardened Wazuh server + OpenSearch dashboard", "Up to 15 Linux/Windows agent enrollments", "Custom alert routing (Email/Slack/Webhook) + handover guide"]'::jsonb, 2),
        (v_svc.id, 'Enterprise', 'Enterprise SOC Stack + 50 Agents & Custom Rules', 'High-availability Wazuh SIEM/XDR deployment with custom detection rules and compliance dashboards.', 68000, 40, 10, 3, false,
         '["HA Wazuh + OpenSearch cluster & log retention tuning", "Up to 50 endpoints + cloud audit log integration", "Custom active-response rules & SOC runbook training"]'::jsonb, 3)
      on conflict (service_id, tier_name) do update set
        package_name = excluded.package_name,
        summary = excluded.summary,
        price_cents = excluded.price_cents,
        deposit_percent = excluded.deposit_percent,
        delivery_days = excluded.delivery_days,
        revisions_included = excluded.revisions_included,
        is_popular = excluded.is_popular,
        features = excluded.features,
        sort_order = excluded.sort_order;

    elsif v_svc.slug = 'fullstack-web-development' then
      insert into public.service_packages (service_id, tier_name, package_name, summary, price_cents, deposit_percent, delivery_days, revisions_included, is_popular, features, sort_order)
      values
        (v_svc.id, 'Starter', 'Starter Web Module or Landing Platform', 'High-conversion marketing site, portfolio, or custom full-stack module.', 12000, 50, 5, 2, false,
         '["Responsive Next.js + Tailwind UI + SEO optimization", "Contact/lead capture + database integration", "Production deployment (Vercel / Cloudflare)"]'::jsonb, 1),
        (v_svc.id, 'Standard', 'Full-Stack Portal + CRM / Dashboard', 'Complete authenticated client/admin web application with database & storage.', 38000, 50, 14, 3, true,
         '["Multi-role authentication + PostgreSQL RLS schema", "Admin & client dashboards + file storage + email dispatch", "Automated tests + CI/CD pipeline + documentation"]'::jsonb, 2),
        (v_svc.id, 'Enterprise', 'Custom SaaS MVP & Enterprise Platform', 'End-to-end multi-tenant SaaS platform, invoicing/payment engine, and hardened infrastructure.', 85000, 40, 25, 4, false,
         '["Complete multi-module architecture & RBAC", "Custom billing, webhook, R2 vault & audit trails", "30-day post-launch warranty & security hardening"]'::jsonb, 3)
      on conflict (service_id, tier_name) do update set
        package_name = excluded.package_name,
        summary = excluded.summary,
        price_cents = excluded.price_cents,
        deposit_percent = excluded.deposit_percent,
        delivery_days = excluded.delivery_days,
        revisions_included = excluded.revisions_included,
        is_popular = excluded.is_popular,
        features = excluded.features,
        sort_order = excluded.sort_order;

    elsif v_svc.slug = 'api-backend-engineering' then
      insert into public.service_packages (service_id, tier_name, package_name, summary, price_cents, deposit_percent, delivery_days, revisions_included, is_popular, features, sort_order)
      values
        (v_svc.id, 'Starter', 'Targeted Bug Fix or Single Integration', 'Rapid diagnosis and resolution of a critical bug, auth issue, or API integration.', 7500, 50, 2, 1, false,
         '["Root-cause analysis & clean production patch", "Input validation & regression test", "Pull request with verification walkthrough"]'::jsonb, 1),
        (v_svc.id, 'Standard', 'Custom API Module or Backend Refactor', 'End-to-end backend feature module, webhook pipeline, or database optimization.', 20000, 50, 5, 2, true,
         '["Secure REST/RPC endpoint design & implementation", "Database schema + query indexing + rate limiting", "Integration test suite & API documentation"]'::jsonb, 2),
        (v_svc.id, 'Enterprise', 'Full Backend Architecture & Security Overhaul', 'Complete backend refactoring, multi-provider webhook orchestration, and security hardening.', 45000, 50, 10, 3, false,
         '["Multi-service API architecture & auth overhaul", "Idempotent job queues, audit logging & RBAC", "Load testing, query tuning & deployment automation"]'::jsonb, 3)
      on conflict (service_id, tier_name) do update set
        package_name = excluded.package_name,
        summary = excluded.summary,
        price_cents = excluded.price_cents,
        deposit_percent = excluded.deposit_percent,
        delivery_days = excluded.delivery_days,
        revisions_included = excluded.revisions_included,
        is_popular = excluded.is_popular,
        features = excluded.features,
        sort_order = excluded.sort_order;

    elsif v_svc.slug = 'cloud-linux-devops' then
      insert into public.service_packages (service_id, tier_name, package_name, summary, price_cents, deposit_percent, delivery_days, revisions_included, is_popular, features, sort_order)
      values
        (v_svc.id, 'Starter', 'Single Server Hardening & SSL/Proxy Setup', 'Harden 1 Ubuntu/CentOS server with Nginx, TLS, firewall, and automated backups.', 8000, 50, 2, 1, false,
         '["CIS-aligned SSH, UFW, Fail2ban & kernel hardening", "Nginx reverse proxy + Cloudflare/Let''s Encrypt SSL", "Automated encrypted off-site backup cron"]'::jsonb, 1),
        (v_svc.id, 'Standard', 'Dockerization + CI/CD & Cloud Migration', 'Containerize your stack and deploy with automated GitHub Actions CI/CD.', 22000, 50, 6, 2, true,
         '["Multi-stage Docker & Compose production setup", "GitHub Actions build/test/deploy pipeline", "Zero-downtime migration + monitoring alerts"]'::jsonb, 2),
        (v_svc.id, 'Enterprise', 'Multi-Node Cloud Infrastructure & DevSecOps', 'High-availability cloud architecture across AWS/Azure/DO with security scanning and observability.', 48000, 40, 10, 3, false,
         '["Multi-server cloud network, IAM & private VPC setup", "Automated DevSecOps CI/CD with secret & image scanning", "Centralized logging, uptime monitoring & disaster recovery"]'::jsonb, 3)
      on conflict (service_id, tier_name) do update set
        package_name = excluded.package_name,
        summary = excluded.summary,
        price_cents = excluded.price_cents,
        deposit_percent = excluded.deposit_percent,
        delivery_days = excluded.delivery_days,
        revisions_included = excluded.revisions_included,
        is_popular = excluded.is_popular,
        features = excluded.features,
        sort_order = excluded.sort_order;

    elsif v_svc.slug = 'ai-ml-automation' then
      insert into public.service_packages (service_id, tier_name, package_name, summary, price_cents, deposit_percent, delivery_days, revisions_included, is_popular, features, sort_order)
      values
        (v_svc.id, 'Starter', 'Starter AI/LLM Workflow or Data Script', 'Custom Python data analysis script, prompt pipeline, or single LLM API integration.', 15000, 50, 4, 1, false,
         '["Data preprocessing & exploratory analysis script", "OpenAI / Gemini / Anthropic structured output integration", "Clean Python module + usage documentation"]'::jsonb, 1),
        (v_svc.id, 'Standard', 'Custom ML Pipeline or AI Integration', 'End-to-end model training/evaluation or production LLM workflow module.', 39000, 50, 10, 2, true,
         '["Dataset cleaning, feature engineering & model training", "Full evaluation metrics (ROC-AUC, F1, confusion matrix)", "Deployable Python API service or Next.js integration"]'::jsonb, 2),
        (v_svc.id, 'Enterprise', 'Enterprise Threat/Fraud ML Engine & RAG System', 'Production-grade multi-model ML classification system or custom RAG knowledge platform.', 82000, 40, 14, 3, false,
         '["Custom ensemble ML training & hyperparameter tuning", "Vector search / RAG pipeline with strict guardrails", "Dockerized inference API + monitoring & handover"]'::jsonb, 3)
      on conflict (service_id, tier_name) do update set
        package_name = excluded.package_name,
        summary = excluded.summary,
        price_cents = excluded.price_cents,
        deposit_percent = excluded.deposit_percent,
        delivery_days = excluded.delivery_days,
        revisions_included = excluded.revisions_included,
        is_popular = excluded.is_popular,
        features = excluded.features,
        sort_order = excluded.sort_order;

    elsif v_svc.slug = 'executive-tech-support-recovery' then
      insert into public.service_packages (service_id, tier_name, package_name, summary, price_cents, deposit_percent, delivery_days, revisions_included, is_popular, features, sort_order)
      values
        (v_svc.id, 'Starter', 'Priority Support & Troubleshooting Session', 'Dedicated 1-on-1 technical rescue, OPSEC/proxy setup, or cloud configuration session.', 5000, 100, 1, 1, false,
         '["Direct remote diagnosis & hands-on resolution", "Google Workspace / M365 / proxy / DNS configuration", "Post-session hardening checklist"]'::jsonb, 1),
        (v_svc.id, 'Standard', 'Account/Asset Recovery & Lockdown', 'Compromised account/server recovery and complete post-incident security lockdown.', 15000, 50, 3, 2, true,
         '["Forensic compromise assessment & recovery workflow", "Cloud drive / email / domain restoration", "MFA, session purge & SPF/DKIM/DMARC lockdown"]'::jsonb, 2),
        (v_svc.id, 'Enterprise', 'Monthly Technical & Security Retainer', 'Ongoing monthly priority engineering, security monitoring, and on-call executive support.', 35000, 100, 30, 4, false,
         '["Up to 15 dedicated engineering/security hours per month", "Priority <12h response SLA via WhatsApp & Portal", "Monthly server/application health check & patching"]'::jsonb, 3)
      on conflict (service_id, tier_name) do update set
        package_name = excluded.package_name,
        summary = excluded.summary,
        price_cents = excluded.price_cents,
        deposit_percent = excluded.deposit_percent,
        delivery_days = excluded.delivery_days,
        revisions_included = excluded.revisions_included,
        is_popular = excluded.is_popular,
        features = excluded.features,
        sort_order = excluded.sort_order;
    end if;
  end loop;

  -- Update Upwork profile URL on resume_items
  update public.resume_items
  set verification_url = 'https://www.upwork.com/freelancers/~01bd47ab2da223b848'
  where section = 'experience' and organization = 'Upwork';

  -- Replace portfolio_items with the enriched 15-item portfolio spanning GitHub repos, cybersecurity engagements, and Upwork contracts
  delete from public.portfolio_items;

  insert into public.portfolio_items (
    code, slug, pillar, pillar_label, title, client_sector, year, headline_metric,
    summary, challenge, approach, outcomes, stack, related_service_slug, external_url,
    is_published, is_featured, sort_order
  ) values
  (
    'CS-101',
    'vapt-fintech-api',
    'cybersecurity',
    'Cybersecurity & Offensive Security',
    'Web, REST API & Network Penetration Testing (VAPT)',
    'FinTech, SaaS & Upwork International Clients',
    '2024–2026',
    'OWASP Top 10 & API Security VAPT · 5.0★ Verified Upwork Security Tester',
    'Black-box and grey-box OWASP Top 10, API Security, and Kali Linux network assessments covering authorization boundaries, session tokens, and business-logic flaws.',
    'Clients required independent offensive security testing across web applications, REST APIs, and perimeter networks to uncover exploitable vulnerabilities before production release.',
    array[
      'Executed signed Rules of Engagement (RoE) and threat-modeled multi-role authorization boundaries.',
      'Performed manual exploitation validation using Burp Suite Pro, Kali Linux, Nmap, OWASP ZAP, and Nuclei.',
      'Delivered reproducible PoC evidence, CVSS v3.1 risk scoring, and developer remediation walkthroughs.'
    ],
    array[
      'Critical and high-risk authentication and authorization flaws remediated and verified on re-test.',
      'Maintained 100% Job Success and 5.0★ client feedback across Security Tester contracts on Upwork.',
      'Delivered executive summaries alongside developer-ready patch blueprints.'
    ],
    array['OWASP Top 10', 'API Security', 'Burp Suite Pro', 'Kali Linux', 'Nuclei', 'CVSS v3.1'],
    'vapt-penetration-testing',
    'https://www.upwork.com/freelancers/~01bd47ab2da223b848',
    true,
    true,
    10
  ),
  (
    'CS-102',
    'enterprise-client-crm-portal',
    'development',
    'Full-Stack Web & Custom Software',
    'Redwan.work — Full-Stack Client CRM, Order & Encrypted Vault Platform',
    'B2B Security & Engineering Commerce · GitHub Public Repo',
    '2026',
    'Next.js 16 · Supabase PostgreSQL RLS · Cloudflare R2 Encrypted Vault',
    'Architected a full-lifecycle client relationship and service commerce platform with proposals, digital RoE sign-off, versioned R2 deliverables, and multi-currency invoicing.',
    'Traditional freelance workflows fragment communication, deliverables, and invoices across disconnected tools. The goal was a single, high-trust portal for taking orders, delivering sensitive security reports, and managing retainers.',
    array[
      'Designed a 19-migration PostgreSQL schema with strict Row-Level Security (RLS) and atomic financial stored procedures.',
      'Integrated a Cloudflare R2 Encrypted Deliverables Vault with SHA-256 checksums and audit-logged presigned downloads.',
      'Built an Antigravity-inspired Tailwind CSS v4 + Motion interface with progressive 2-phase authentication and MFA enforcement.'
    ],
    array[
      'Unified service catalog -> custom quote/order -> encrypted delivery -> invoice -> verified review pipeline.',
      'Automated unit, database, Playwright E2E, WCAG accessibility, and SEO verification gates.'
    ],
    array['Next.js 16', 'TypeScript', 'Tailwind CSS v4', 'Supabase RLS', 'Cloudflare R2', 'Resend'],
    'fullstack-web-development',
    'https://github.com/redwan-cse/redwan.work',
    true,
    true,
    20
  ),
  (
    'CS-103',
    'fast-cyber-defense-platform',
    'development',
    'Full-Stack Web & Custom Software',
    'Fast Cyber Defense — Cybersecurity Agency Platform & Support Portal',
    'Cybersecurity Agency · Organization Repository',
    '2025–2026',
    'Full-Stack Agency Ecosystem · Support Portal & Zcal Booking Integration',
    'Engineered the web platform, client support center (fcd-support), and consultation scheduling architecture for Fast Cyber Defense (fastcyberdefense.com).',
    'Needed a fast, conversion-focused cybersecurity agency platform paired with a dedicated support portal, granular GDPR cookie preference controls, and sticky legal/compliance documentation.',
    array[
      'Developed the core agency platform and fcd-support application in TypeScript and Next.js with modular UI components.',
      'Implemented interactive cookie consent management (Essential, Analytics, Marketing, Social) and sticky legal TOC navigation.',
      'Integrated consultation scheduling (fcd_zcal) and automated technical blog publishing pipelines.'
    ],
    array[
      'Launched a cohesive multi-repo agency ecosystem serving commercial cybersecurity and incident response clients.',
      'Standardized reusable legal, consent, and support UI patterns across agency properties.'
    ],
    array['TypeScript', 'Next.js', 'Tailwind CSS', 'Support Portal', 'Zcal Integration', 'Cloudflare'],
    'fullstack-web-development',
    'https://fastcyberdefense.com',
    true,
    true,
    30
  ),
  (
    'CS-104',
    'jnuits-fullstack-platform',
    'development',
    'Full-Stack Web & Custom Software',
    'Jagannath University IT Society (jnuits.org.bd) — Portal & Admin Suite',
    'Higher Education & Student Tech Organization · Collaborator Repo',
    '2024–2026',
    'Full-Stack Public Portal + Dedicated Admin Panel (admin.jnuits.org.bd)',
    'Collaborated on the full-stack web platform, static fast-load portal, and administrative management system for the 200+ member Jagannath University IT Society.',
    'The university IT society needed a modern digital platform to manage member registrations, workshop announcements, committee directories, and certificate verification.',
    array[
      'Co-developed the TypeScript full-stack portal (jnuits/jnuits-full-stack & jnuits.org.bd) and decoupled admin dashboard (admin.jnuits.org.bd).',
      'Built structured workflows for event publishing, member onboarding, and society announcements.',
      'Deployed static edge assets (static.jnuits.org.bd) for high-traffic campus recruitment drives.'
    ],
    array[
      'Streamlined digital operations and event registration for 200+ active student members and alumni.',
      'Provided long-term maintainability and role-based administration for incoming executive committees.'
    ],
    array['TypeScript', 'Next.js', 'Admin RBAC', 'REST API', 'Tailwind CSS', 'GitHub Actions'],
    'fullstack-web-development',
    'https://jnuits.org.bd',
    true,
    true,
    40
  ),
  (
    'CS-105',
    'sdgc-michigan-web-platform',
    'development',
    'Full-Stack Web & Custom Software',
    'Saugatuck Douglas Garden Club (sdgc.redwan.work) — Web Platform',
    'Non-Profit Community Organization · Michigan, USA (Collaborator Repo)',
    '2026',
    'Cross-Team TypeScript Web Platform · Accessible Community Portal',
    'Collaborated on the design and full-stack TypeScript implementation of the Saugatuck Douglas Garden Club digital platform (sdgcmich/sdgc-web).',
    'The organization required a clean, accessible, mobile-responsive web presence to showcase community horticulture programs, seasonal events, and member resources.',
    array[
      'Engineered responsive pages and reusable component layouts in TypeScript and Next.js.',
      'Calibrated typography, color contrast, and navigation clarity for diverse community demographics.',
      'Configured staging and preview deployments at sdgc.redwan.work for rapid stakeholder review.'
    ],
    array[
      'Delivered a fast, maintainable web platform simplifying event discovery and member engagement.',
      'Established clean Git collaboration workflows across contributor branches.'
    ],
    array['TypeScript', 'Next.js', 'Tailwind CSS', 'Responsive UI', 'Accessibility', 'Vercel'],
    'fullstack-web-development',
    'https://sdgc.redwan.work/',
    true,
    true,
    50
  ),
  (
    'CS-106',
    'openseo-selfhosted-cloud-stack',
    'cloud_devops',
    'Cloud, DevOps & Linux Infrastructure',
    'OpenSEO — Self-Hosted SERP, Headless Chrome & AI Search Infrastructure',
    'Search Intelligence & Cloud Engineering · GitHub Public & Infra Repos',
    '2026',
    '100% Self-Hosted OpenSEO · Native SearXNG + Headless Chrome + DR Backups',
    'Built an unmetered, self-hosted SEO and SERP analysis platform integrating native SearXNG metasearch, Headless Chrome JS rendering, local Manifest AI, and encrypted disaster-recovery snapshots.',
    'Commercial SEO APIs impose steep per-query metering and rate limits. The objective was a 100% self-hosted stack capable of JavaScript-rendered page audits and live SERP tracking.',
    array[
      'Developed the TypeScript OpenSEO application (redwan-cse/open-seo) paired with containerized infrastructure (seo-platform-infra).',
      'Integrated native SearXNG SERP aggregation, Headless Chrome rendering for SPA audits, and local Manifest AI analysis.',
      'Automated encrypted disaster-recovery snapshots (seo-platform-backups) for zero-data-loss restoration.'
    ],
    array[
      'Eliminated third-party SERP API metering while supporting full JavaScript-rendered technical SEO crawls.',
      'Established reproducible container orchestration and automated encrypted backup rotation.'
    ],
    array['TypeScript', 'SearXNG', 'Headless Chrome', 'Docker', 'Manifest AI', 'Encrypted Backups'],
    'cloud-linux-devops',
    'https://github.com/redwan-cse/open-seo',
    true,
    true,
    60
  ),
  (
    'CS-107',
    'cybersecurity-sigma-falco-detection',
    'cybersecurity',
    'Cybersecurity & Offensive Security',
    'Threat Models, Sigma Rules, eBPF/Falco Policies & Browser Hardening Kit',
    'Detection Engineering & Blue Team Research · GitHub Open Source',
    '2025–2026',
    'Sigma Detection Rules · Falco eBPF Policies · Windows Browser Policy Kit',
    'Published open-source detection engineering artifacts (redwan-cse/cybersecurity-research) and PowerShell enterprise browser hardening policies (windows-browser-policy-kit).',
    'Modern blue teams need actionable detection-as-code rules for Active Directory, cloud workloads, and container runtimes alongside repeatable endpoint browser lockdown.',
    array[
      'Authored threat models, Sigma detection rules, and eBPF-based Falco runtime security policies published alongside technical articles on blogs.redwan.work.',
      'Developed PowerShell Group Policy/registry automation (windows-browser-policy-kit) for hardened Chrome, Edge, and Firefox enterprise configurations.',
      'Validated exploit paths and privilege escalation mechanics in controlled lab environments (including CVE-2023-36003 XAML diagnostics PoC analysis).'
    ],
    array[
      'Open-sourced reusable Sigma, Falco, and PowerShell hardening kits for defenders and sysadmins.',
      'Bridged offensive exploit research with practical blue-team detection engineering.'
    ],
    array['Sigma Rules', 'Falco / eBPF', 'Active Directory', 'PowerShell', 'Threat Modeling', 'Blue Team'],
    'siem-security-monitoring',
    'https://github.com/redwan-cse/cybersecurity-research',
    true,
    false,
    70
  ),
  (
    'CS-108',
    'wazuh-siem-soc',
    'cloud_devops',
    'Cloud, DevOps & Linux Infrastructure',
    'Wazuh SIEM/XDR SOC Architecture & CIS Linux Fleet Hardening',
    'Cloud Infrastructure & Enterprise Linux Environments',
    '2024–2025',
    'Centralized Wazuh SIEM · CIS Ubuntu/CentOS Hardening & Active Response',
    'Centralized Wazuh SIEM deployment with custom MITRE ATT&CK detection rules, File Integrity Monitoring (FIM), CIS Linux hardening, and automated active-response IP blocking.',
    'Distributed Ubuntu, CentOS, and Windows workloads lacked centralized log visibility and standardized OS hardening against credential-stuffing and unauthorized file tampering.',
    array[
      'Provisioned hardened Wazuh Server, Indexer, and Dashboard nodes with TLS agent enrollment.',
      'Authored custom XML decoders and rules mapped to MITRE ATT&CK techniques for SSH, Nginx, and web logs.',
      'Applied CIS-aligned Linux administration and hardening practices documented in redwan-cse/centos9-sysadmin-handbook and delivered to BTCL enterprise billing staff.'
    ],
    array[
      'Centralized real-time SSH, web, and file-integrity alerting in a unified Wazuh SOC dashboard.',
      'Enabled automated active-response blocking and standardized Linux server hardening playbooks.'
    ],
    array['Wazuh SIEM', 'Ubuntu / CentOS 9', 'MITRE ATT&CK', 'Docker', 'FIM', 'CIS Hardening'],
    'siem-security-monitoring',
    'https://github.com/redwan-cse/centos9-sysadmin-handbook',
    true,
    false,
    80
  ),
  (
    'CS-109',
    'osint-bec-fraud',
    'cybersecurity',
    'Cybersecurity & Offensive Security',
    'Executive OSINT, Scam Network Attribution & BEC Fraud Investigation',
    'Cross-Border Commerce & Upwork Investigation Clients',
    '2024–2025',
    'Scam Infrastructure Attribution · Lookalike Domain Takedown & DMARC Lockdown',
    'Conducted deep open-source intelligence (OSINT) investigations into scam websites, impersonation networks, and invoice-redirection threats for international clients.',
    'Clients targeted by coordinated scammer networks and typosquatted domains needed forensic attribution, infrastructure mapping, and rapid email/brand containment.',
    array[
      'Performed passive DNS, WHOIS/RDAP history, TLS certificate transparency, and social/handle correlation across scam networks.',
      'Enforced strict SPF, DKIM, and DMARC p=reject policies alongside account MFA and session lockdown.',
      'Compiled structured abuse dossiers for domain registrars and hosting providers to neutralize malicious infrastructure.'
    ],
    array[
      'Mapped scammer infrastructure and supported registrar abuse takedowns and executive OPSEC hardening.',
      'Maintained curated actionable OSINT methodology resources (redwan-cse/OSINT_Collection).'
    ],
    array['OSINT', 'Email Forensics', 'DMARC / DKIM / SPF', 'Threat Attribution', 'Maltego', 'DNS Recon'],
    'osint-threat-investigation',
    'https://github.com/redwan-cse/OSINT_Collection',
    true,
    false,
    90
  ),
  (
    'CS-110',
    'q1-ml-healthcare-security',
    'ai_ml',
    'Applied AI/ML & Automation',
    'Published Q1 Scopus (Elsevier) & IEEE Machine Learning Pipelines',
    'Academic & Applied AI Security Research',
    '2024–2025',
    'Published in Q1 Scopus (Elsevier IJCCE) & IEEE CS BDC Symposium',
    'Peer-reviewed machine learning research and reproducible Python pipelines covering market-segmentation clustering and feature-engineered phishing URL detection (PhishDF).',
    'High-stakes security and behavioral models require strong generalization alongside interpretable feature extraction that practitioners can audit and reproduce.',
    array[
      'Engineered end-to-end preprocessing, feature extraction, and clustering/classification benchmarking in Python and Scikit-Learn.',
      'Developed comprehensive URL lexical, host, and structural feature extraction pipelines for phishing detection (redwan-cse/PhishDF).',
      'Published peer-reviewed papers in Elsevier International Journal of Cognitive Computing in Engineering (Q1 Scopus) and IEEE CS BDC Symposium 2024.'
    ],
    array[
      'Two peer-reviewed publications with DOI/proceedings verification links on the public curriculum vitae.',
      'Applied curriculum in hands-on Machine Learning with Python training for the EDGE Project at Jagannath University.'
    ],
    array['Python', 'Scikit-Learn', 'PhishDF', 'Feature Engineering', 'K-Means Clustering', 'Elsevier Q1 / IEEE'],
    'ai-ml-automation',
    'https://doi.org/10.1016/j.ijcce.2024.04.002',
    true,
    false,
    100
  ),
  (
    'CS-111',
    'leadpilot-and-multi-cloud-bots',
    'ai_ml',
    'Applied AI/ML & Automation',
    'LeadPilot-OS & Multi-Cloud Serverless Bot Automation Suite',
    'Workflow Automation & Serverless Engineering · GitHub Repos',
    '2025–2026',
    'LeadPilot-OS (leads.redwan.work) · AWS Lambda + Cloudflare Workers + Python Bots',
    'Designed LeadPilot-OS for B2B lead intelligence alongside multi-platform serverless automation systems across AWS Lambda, DynamoDB, Cloudflare Workers, Telegram, Discord, and Zoho Mail.',
    'Organizations and communities needed reliable, low-cost automation for lead triage, multi-platform support bots, and scheduled communication workflows without expensive recurring SaaS overhead.',
    array[
      'Architected LeadPilot-OS (redwan-cse/LeadPilot-OS) in TypeScript for structured lead pipeline management.',
      'Built a multi-cloud bot automation system (multi-platform-bot-system) combining AWS Lambda, DynamoDB, Cloudflare Workers, and Google Cloud Storage within free-tier budgets.',
      'Developed Python/Telethon and Discord automation agents (telegram-daily-checkin, zoho-mail-automation, stw-owner-bot) with SOCKS5 proxy support and jitter.'
    ],
    array[
      'Automated repetitive lead, email, and community support operations across web, Telegram, and Discord.',
      'Achieved resilient serverless execution with minimal cloud infrastructure cost.'
    ],
    array['TypeScript', 'Python', 'AWS Lambda', 'Cloudflare Workers', 'DynamoDB', 'Telethon / Discord.py'],
    'ai-ml-automation',
    'https://github.com/redwan-cse/multi-platform-bot-system',
    true,
    false,
    110
  ),
  (
    'CS-112',
    'ledger-technical-publishing-stack',
    'development',
    'Full-Stack Web & Custom Software',
    'Ledger Technical Publishing Theme, Django URL Service & Java eLibrary',
    'Open-Source Web Engineering & Academic Systems · GitHub Public Repos',
    '2023–2026',
    'Ledger Blogger Theme (blogs.redwan.work) · Django & Java/MySQL Systems',
    'Created the open-source Ledger technical publishing theme for blogs.redwan.work alongside a Python/Django URL shortener web app and a collaborative Java eLibrary platform.',
    'Technical security publications require fast typography, syntax highlighting, and clean structured metadata, while campus utilities needed lightweight URL routing and digital library cataloging.',
    array[
      'Engineered redwan-cse/ledger-blogger-theme in TypeScript and SCSS with dedicated CDN asset delivery (blog-assets).',
      'Built redwan-cse/URL-Shortener-Django in Python/Django for clean link aliasing and redirect analytics.',
      'Collaborated on JnU_eLibrary (redwan-cse/JnU_eLibrary) in Java for university digital book cataloging and lending workflows.'
    ],
    array[
      'Powers technical cybersecurity research publishing at blogs.redwan.work under the PolyForm Noncommercial license.',
      'Demonstrated full-stack versatility across TypeScript, Python/Django, and Java software engineering.'
    ],
    array['TypeScript', 'Python / Django', 'Java', 'SCSS', 'Technical Publishing', 'PolyForm License'],
    'api-backend-engineering',
    'https://github.com/redwan-cse/ledger-blogger-theme',
    true,
    false,
    120
  ),
  (
    'CS-113',
    'wireguard-gateway-cloud-infra',
    'cloud_devops',
    'Cloud, DevOps & Linux Infrastructure',
    'WireGuard VPS Gateway, Self-Hosted PaaS & DevOps Guidebook Architecture',
    'Hybrid Cloud & Self-Hosted Infrastructure · GitHub Repos',
    '2024–2026',
    'Home-Origin + VPS WireGuard Gateway · Docker / Coolify & CI/CD Pipelines',
    'Designed a "Home Origin + VPS Gateway" WireGuard dumb-pipe architecture (myHomeLab), automated server backup tracking (oc-backup), and a public DevOps Guidebook.',
    'Self-hosting production workloads behind residential or private origins requires secure ingress tunneling, static public IP termination, and automated configuration backups without exposing internal networks.',
    array[
      'Engineered Shell-automated WireGuard tunnel routing between public VPS gateways and private origin servers (redwan-cse/myHomeLab).',
      'Configured automated server state and configuration backups (oc-backup) alongside Docker, Nginx, and Coolify PaaS deployments.',
      'Authored structured cloud, CI/CD, and containerization documentation in redwan-cse/DevOpsGuidebook.'
    ],
    array[
      'Enabled low-latency, DDoS-shielded public ingress to private self-hosted origins without opening local router ports.',
      'Standardized repeatable Docker + GitHub Actions deployment workflows across personal and client servers.'
    ],
    array['WireGuard VPN', 'Linux Shell', 'Docker', 'Nginx', 'GitHub Actions', 'Coolify / VPS'],
    'cloud-linux-devops',
    'https://redwan-cse.gitbook.io/devopsguidebook/',
    true,
    false,
    130
  ),
  (
    'CS-114',
    'emergency-breach-recovery',
    'tech_support',
    'Executive Tech Support & Digital Recovery',
    'Compromised Account, Server & Cloud Drive Forensic Recovery (Upwork 5.0★)',
    'Executive Tech Support & Cloud Data Recovery · Upwork Verified',
    '2023–2026',
    '5.0★ Upwork Verified · Google Drive / OneDrive Recovery & Breach Cleanup',
    'Recovered hacked business/social accounts, restored permanently deleted Google Drive and OneDrive files, migrated Google Workspace drives, and cleaned compromised web servers.',
    'Clients faced urgent business disruption from permanently purged Google Drive folders, lost OneDrive documents, hijacked online accounts, and malware-infected web hosts.',
    array[
      'Executed admin-console audit trail analysis and Google Workspace / OneDrive retention recovery workflows to restore permanently deleted business files.',
      'Performed cross-tenant Google Drive migrations while preserving folder hierarchies and sharing permissions.',
      'Isolated compromised web servers, eradicated persistence backdoors, rotated credentials, and enforced MFA and WAF rules.'
    ],
    array[
      'Successfully recovered critical client Google Drive and OneDrive datasets with 5.0★ verified client reviews on Upwork ("You saved my life, high quality work").',
      'Restored compromised accounts and servers to clean, MFA-protected operational state.'
    ],
    array['Google Workspace Admin', 'Cloud Data Recovery', 'Incident Response', 'Account Recovery', 'OneDrive Forensics', 'WAF Hardening'],
    'executive-tech-support-recovery',
    'https://www.upwork.com/freelancers/~01bd47ab2da223b848',
    true,
    false,
    140
  ),
  (
    'CS-115',
    'opsec-fingerprint-proxy-engineering',
    'tech_support',
    'Executive Tech Support & Digital Recovery',
    'Anti-Bot Fingerprint Isolation, SOCKS5 Proxy & ISP Network Routing (Upwork 5.0★)',
    'Privacy Engineering, Automation & Network Administration · Upwork Verified',
    '2025–2026',
    '5.0★ Upwork Verified · Anti-Bot Fingerprint + SOCKS5 Proxifier + ISP Routing',
    'Engineered anti-bot browser fingerprint isolation workflows, Windows SOCKS5 Proxifier playbooks, and cross-ISP Chromebook/network routing solutions for international clients.',
    'Clients required reliable browser fingerprint isolation for automated testing, leak-free SOCKS5 proxy routing on Windows, and complex cross-ISP Chromebook and network diagnostics.',
    array[
      'Configured anti-bot browser fingerprint profiles and task automation workflows (5.0★ Upwork contract: "Expert Needed for Fingerprint Changing with Anti-Bot Method").',
      'Authored a reusable Windows Proxifier engineering playbook (redwan-cse/proxifier-windows-playbook) covering SOCKS5 rules, proxy DNS, WPAD exclusions, and IPv6 leak prevention.',
      'Resolved cross-ISP network routing and Chromebook management challenges alongside Google Merchant and PDF automation deployments.'
    ],
    array[
      'Delivered leak-free proxy routing and anti-bot automation with 5.0★ rating ("Great working with you, solved my problem in a timely manner").',
      'Documented repeatable SOCKS5, DNS, and browser policy playbooks for rapid client deployment.'
    ],
    array['Anti-Bot / Fingerprinting', 'SOCKS5 / Proxifier', 'Network Security', 'Chromebook Admin', 'DNS / IPv6 OPSEC', 'Task Automation'],
    'executive-tech-support-recovery',
    'https://www.upwork.com/freelancers/~01bd47ab2da223b848',
    true,
    false,
    150
  );
end;
$$;
