'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion } from 'motion/react';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  CloudCog,
  Code2,
  ExternalLink,
  LifeBuoy,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { InteractiveCard, ScrollReveal } from '@/components/motion/reveal';
import type { ServicePillarKey } from '@/lib/content/site';
import { cn } from '@/lib/utils';

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

const PORTFOLIO_ITEMS: PortfolioCaseStudy[] = [
  {
    id: 'vapt-fintech-api',
    code: 'CS-101',
    pillar: 'cybersecurity',
    pillarLabel: 'Cybersecurity & Offensive Security',
    title: 'Multi-Tenant FinTech Web & REST API Penetration Test',
    clientSector: 'Financial Technology · North America',
    year: '2025',
    headlineMetric: '14 Critical/High Vulnerabilities Remediated · 100% Re-Test Pass',
    summary:
      'Full-scope black-box and grey-box OWASP Top 10 & API Security assessment uncovering cross-tenant IDOR, JWT key confusion, and SSRF vulnerabilities prior to Series A audit.',
    challenge:
      'The client needed an independent C|EH-led offensive security audit across 45+ REST endpoints and an administrative dashboard before onboarding enterprise banking partners.',
    approach: [
      'Executed signed Rules of Engagement (RoE) and threat-modeled multi-tenant isolation boundaries.',
      'Performed manual authorization matrix testing in Burp Suite Pro, discovering horizontal privilege escalation in settlement export routes.',
      'Delivered reproducible PoC scripts, CVSS v3.1 scoring, and a developer patch workshop.',
    ],
    outcomes: [
      'All 14 Critical and High findings patched and verified within 9 business days.',
      'Issued formal Penetration Testing Attestation Letter for enterprise security questionnaires.',
      'Zero security incidents in production post-launch.',
    ],
    stack: ['C|EH VAPT', 'OWASP API Top 10', 'Burp Suite Pro', 'Nmap', 'JWT / OAuth2', 'CVSS v3.1'],
    relatedServiceSlug: 'penetration-testing-vapt',
  },
  {
    id: 'redwan-crm-portal',
    code: 'CS-102',
    pillar: 'development',
    pillarLabel: 'Full-Stack Web & Custom Software',
    title: 'Production Client CRM, Order & Encrypted Deliverables Vault Platform',
    clientSector: 'B2B Consulting & Digital Commerce',
    year: '2026',
    headlineMetric: 'Next.js 16 · Row-Level Security · Atomic Financial Ledger',
    summary:
      'Architected a full-lifecycle client relationship and service commerce platform with proposals, C|EH RoE sign-off, versioned encrypted deliverables, and multi-currency invoicing.',
    challenge:
      'Traditional freelance workflows fragment communication, files, and invoices across disconnected tools. The goal was a single, high-trust portal for taking orders, delivering files, and retaining clients.',
    approach: [
      'Designed a 30+ table relational schema with strict Row-Level Security (RLS) and atomic stored procedures.',
      'Integrated an Encrypted Deliverables Vault with SHA-256 checksums and audit-logged presigned downloads.',
      'Built an Antigravity-inspired Tailwind CSS v4 + Motion interface with dark/light theme support.',
    ],
    outcomes: [
      'Unified inquiry -> proposal -> order -> encrypted delivery -> invoice -> retainer pipeline.',
      '100% immutable audit trail across every payment review and deliverable sign-off.',
    ],
    stack: ['Next.js 16', 'TypeScript', 'Tailwind CSS v4', 'PostgreSQL RLS', 'Encrypted Vault', 'Motion'],
    relatedServiceSlug: 'fullstack-web-development',
  },
  {
    id: 'wazuh-siem-soc',
    code: 'CS-103',
    pillar: 'cloud_devops',
    pillarLabel: 'Cloud, DevOps & Linux Infrastructure',
    title: 'Wazuh SIEM/XDR SOC Architecture & Linux Fleet Hardening',
    clientSector: 'E-Commerce & Cloud SaaS Fleet (35+ Servers)',
    year: '2025',
    headlineMetric: 'Sub-15s Threat Detection · 94% Brute-Force & Bot Drop',
    summary:
      'Centralized Wazuh SIEM deployment with custom MITRE ATT&CK detection rules, File Integrity Monitoring (FIM), CIS Linux hardening, and automated active-response IP blocking.',
    challenge:
      'The client operated 35+ Ubuntu and Windows servers across AWS and DigitalOcean without centralized log visibility, suffering repeated credential-stuffing and unauthorized file tampering attempts.',
    approach: [
      'Provisioned a hardened Wazuh Server, Indexer, and Dashboard cluster with TLS mutual authentication.',
      'Authored custom XML decoders and rules mapped to MITRE ATT&CK techniques for SSH, Nginx, and web application logs.',
      'Applied CIS Level-2 hardening across all Linux hosts (SSH key-only auth, UFW/nftables, Fail2ban, kernel sysctl tuning).',
    ],
    outcomes: [
      'Mean time to detect (MTTD) suspicious privilege escalation reduced from days to under 15 seconds.',
      'Automated active response blocked 12,000+ malicious IPs in the first 30 days.',
    ],
    stack: ['Wazuh SIEM', 'Ubuntu / Debian', 'MITRE ATT&CK', 'Docker', 'Cloudflare WAF', 'CIS Benchmarks'],
    relatedServiceSlug: 'wazuh-siem-soc-engineering',
  },
  {
    id: 'osint-bec-fraud',
    code: 'CS-104',
    pillar: 'cybersecurity',
    pillarLabel: 'Cybersecurity & Offensive Security',
    title: 'Executive OSINT & Business Email Compromise (BEC) Investigation',
    clientSector: 'Cross-Border Trade & Legal Advisory',
    year: '2025',
    headlineMetric: 'Lookalike Infrastructure Takedown · Full Forensic Attribution',
    summary:
      'Traced a sophisticated invoice-redirection and domain-impersonation campaign targeting executive wire transfers, compiling an evidentiary dossier and executing rapid email/DNS lock-down.',
    challenge:
      'Threat actors registered typosquatted domains and intercepted vendor threads to divert a six-figure wire transfer.',
    approach: [
      'Conducted passive DNS, TLS certificate transparency, and header-hop forensic analysis to map attacker infrastructure.',
      'Enforced strict SPF, DKIM, and DMARC `p=reject` policies alongside conditional access MFA rules.',
      'Submitted abuse evidence packages to registrars and hosting providers to neutralize lookalike domains.',
    ],
    outcomes: [
      'Prevented fraudulent wire disbursement and neutralized 4 impersonation domains within 48 hours.',
      'Delivered a board-ready forensic timeline and executive OPSEC playbook.',
    ],
    stack: ['OSINT', 'Email Forensics', 'DMARC / DKIM / SPF', 'Threat Intelligence', 'Maltego'],
    relatedServiceSlug: 'osint-fraud-investigation',
  },
  {
    id: 'q1-ml-healthcare-security',
    code: 'CS-105',
    pillar: 'ai_ml',
    pillarLabel: 'Applied AI/ML & Automation',
    title: 'Published Q1 Scopus & IEEE Machine Learning Pipelines',
    clientSector: 'Academic & Applied AI Research',
    year: '2024–2025',
    headlineMetric: 'Published in Q1 Scopus (Array, Elsevier) & IEEE Xplore',
    summary:
      'Peer-reviewed machine learning research and production inference pipelines combining ensemble classifiers, feature engineering, and SHAP explainable AI.',
    challenge:
      'High-stakes predictive models require not only strong accuracy and ROC-AUC but transparent feature attribution that domain experts can audit and trust.',
    approach: [
      'Engineered end-to-end preprocessing, class-imbalance handling, and hyperparameter optimization across gradient-boosted and deep tabular architectures.',
      'Integrated SHAP (SHapley Additive exPlanations) for global and instance-level prediction interpretability.',
      'Published peer-reviewed findings in Elsevier Array (Q1 Scopus) and IEEE conferences.',
    ],
    outcomes: [
      'Multiple peer-reviewed publications validating methodology and reproducibility.',
      'Reusable Python inference modules adaptable to fraud, phishing, and clinical risk scoring.',
    ],
    stack: ['Python', 'Scikit-Learn', 'XGBoost / LightGBM', 'SHAP', 'Pandas', 'IEEE / Elsevier Q1'],
    relatedServiceSlug: 'applied-ai-ml-and-automation',
    externalUrl: '/resume#research',
  },
  {
    id: 'emergency-breach-recovery',
    code: 'CS-106',
    pillar: 'tech_support',
    pillarLabel: 'Executive Tech Support & Digital Recovery',
    title: '24-Hour Compromised Production Server & Web Platform Recovery',
    clientSector: 'High-Traffic Media & E-Commerce',
    year: '2025',
    headlineMetric: 'Full Eradication & Clean Restore in < 6 Hours · Zero Data Loss',
    summary:
      'Emergency containment, rootkit/webshell removal, database rescue, and Cloudflare WAF shielding for a compromised Linux production server blacklisted by Google Safe Browsing.',
    challenge:
      'An unpatched plugin and exposed credential allowed attackers to inject obfuscated PHP/JS malware and cron persistence, taking checkout offline.',
    approach: [
      'Isolated the host, captured forensic snapshots, and identified all modified binaries and rogue cron/systemd units.',
      'Rebuilt the application runtime on a clean hardened Ubuntu instance, rotated all secrets, and placed Cloudflare WAF in front of origin.',
      'Submitted clean verification for Google Safe Browsing delisting.',
    ],
    outcomes: [
      'Production restored cleanly in under 6 hours with zero customer data loss.',
      'Client transitioned onto an ongoing monthly security & engineering retainer.',
    ],
    stack: ['Incident Response', 'Linux Forensics', 'Malware Removal', 'Cloudflare WAF', 'Nginx'],
    relatedServiceSlug: 'emergency-recovery-and-tech-support',
  },
];

const FILTER_TABS: Array<{
  key: 'all' | ServicePillarKey;
  label: string;
  icon: typeof ShieldAlert;
}> = [
  { key: 'all', label: 'All Work', icon: Sparkles },
  { key: 'cybersecurity', label: 'Cybersecurity & VAPT', icon: ShieldAlert },
  { key: 'development', label: 'Full-Stack Dev', icon: Code2 },
  { key: 'cloud_devops', label: 'SIEM & Cloud Ops', icon: CloudCog },
  { key: 'ai_ml', label: 'AI/ML & Research', icon: Bot },
  { key: 'tech_support', label: 'Incident Recovery', icon: LifeBuoy },
];

export function PortfolioShowcase({
  initialItems,
}: {
  initialItems?: PortfolioCaseStudy[];
}) {
  const searchParams = useSearchParams();
  const initialCategory = searchParams?.get('category') as ServicePillarKey | null;

  const [selectedCategory, setSelectedCategory] = useState<'all' | ServicePillarKey>(
    initialCategory && FILTER_TABS.some((t) => t.key === initialCategory)
      ? initialCategory
      : 'all'
  );
  const [activeStudy, setActiveStudy] = useState<PortfolioCaseStudy | null>(null);

  const items = useMemo(
    () => (initialItems && initialItems.length > 0 ? initialItems : PORTFOLIO_ITEMS),
    [initialItems]
  );

  const filteredItems = useMemo(() => {
    if (selectedCategory === 'all') return items;
    return items.filter((item) => item.pillar === selectedCategory);
  }, [items, selectedCategory]);

  return (
    <div className="space-y-10">
      {/* Category Filter Pills */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {FILTER_TABS.map(({ key, label, icon: Icon }) => {
          const isActive = selectedCategory === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedCategory(key)}
              className={cn(
                'relative inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-medium transition-colors sm:text-sm',
                isActive
                  ? 'border-primary text-primary-foreground'
                  : 'border-border/80 bg-card/70 text-muted-foreground hover:border-primary/40 hover:text-foreground'
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="portfolio-filter-pill"
                  transition={{ type: 'spring', stiffness: 360, damping: 30 }}
                  className="absolute inset-0 rounded-full bg-primary"
                />
              )}
              <Icon className="relative z-10 h-4 w-4" />
              <span className="relative z-10">{label}</span>
            </button>
          );
        })}
      </div>

      {/* Case Studies Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filteredItems.map((study, idx) => (
          <ScrollReveal key={study.id} delay={idx * 0.05}>
            <InteractiveCard className="flex h-full flex-col justify-between p-6">
              <div>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <Badge variant="outline" className="font-mono text-[11px] text-primary">
                    {study.code} · {study.year}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground">
                    {study.pillarLabel}
                  </span>
                </div>

                <h2 className="text-xl font-bold tracking-tight">{study.title}</h2>
                <p className="mt-1 text-xs font-medium text-muted-foreground">
                  {study.clientSector}
                </p>

                <div className="mt-3 rounded-lg border border-primary/20 bg-primary/8 px-3 py-2 font-mono text-xs font-medium text-primary">
                  {study.headlineMetric}
                </div>

                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {study.summary}
                </p>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {study.stack.map((tech) => (
                    <span
                      key={tech}
                      className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between gap-2 border-t border-border/60 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full text-xs"
                  onClick={() => setActiveStudy(study)}
                >
                  Read Full Case Study
                </Button>
                <Button asChild variant="ghost" size="sm" className="gap-1 rounded-full text-xs text-primary">
                  <Link href={`/services?pillar=${study.pillar}`}>
                    Order Similar
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            </InteractiveCard>
          </ScrollReveal>
        ))}
      </div>

      {/* Case Study Modal Dialog */}
      <Dialog
        open={Boolean(activeStudy)}
        onOpenChange={(open) => {
          if (!open) setActiveStudy(null);
        }}
      >
        {activeStudy && (
          <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs text-primary">
                  {activeStudy.code} · {activeStudy.pillarLabel}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {activeStudy.clientSector} ({activeStudy.year})
                </span>
              </div>
              <DialogTitle className="text-2xl font-bold">
                {activeStudy.title}
              </DialogTitle>
              <DialogDescription className="rounded-md border border-primary/20 bg-primary/8 px-3 py-2 font-mono text-xs font-medium text-primary">
                {activeStudy.headlineMetric}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 text-sm">
              <div>
                <h4 className="font-mono text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  1. The Challenge
                </h4>
                <p className="mt-1.5 leading-relaxed text-foreground/90">
                  {activeStudy.challenge}
                </p>
              </div>

              <div>
                <h4 className="font-mono text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  2. Technical Execution &amp; Methodology
                </h4>
                <ul className="mt-2 space-y-2">
                  {activeStudy.approach.map((step) => (
                    <li key={step} className="flex items-start gap-2 text-foreground/90">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="font-mono text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  3. Verified Outcomes
                </h4>
                <ul className="mt-2 space-y-2">
                  {activeStudy.outcomes.map((outcome) => (
                    <li key={outcome} className="flex items-start gap-2 text-foreground/90">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{outcome}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-wrap gap-1.5 border-t border-border pt-4">
                {activeStudy.stack.map((tech) => (
                  <span
                    key={tech}
                    className="rounded-md bg-muted px-2.5 py-1 font-mono text-xs text-muted-foreground"
                  >
                    {tech}
                  </span>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
                {activeStudy.externalUrl && (
                  <Button asChild variant="outline" size="sm" className="gap-1.5 rounded-full">
                    <Link href={activeStudy.externalUrl}>
                      View Research / Details
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                )}
                <Button asChild size="sm" className="gap-1.5 rounded-full">
                  <Link href={`/contact?service=${activeStudy.relatedServiceSlug}`}>
                    Start a Similar Engagement
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
