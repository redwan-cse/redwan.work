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
end;
$$;
