'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion, useReducedMotion } from 'motion/react';
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
    headlineMetric: 'OWASP API & Multi-Tenant VAPT · Re-Test Verified',
    summary:
      'Black-box and grey-box OWASP Top 10 & API Security assessment covering cross-tenant authorization boundaries, session tokens, and SSRF surfaces prior to partner audit.',
    challenge:
      'The client needed an independent offensive security assessment across REST API endpoints and an administrative dashboard before onboarding enterprise partners.',
    approach: [
      'Executed signed Rules of Engagement (RoE) and threat-modeled multi-tenant isolation boundaries.',
      'Performed manual authorization matrix testing in Burp Suite Pro across settlement export routes.',
      'Delivered reproducible PoC steps, CVSS v3.1 scoring, and a developer remediation walkthrough.',
    ],
    outcomes: [
      'Critical and high-risk authorization findings remediated and verified on re-test.',
      'Issued formal Penetration Testing Attestation summary for partner security review.',
      'Delivered actionable developer remediation guidance aligned with CVSS v3.1.',
    ],
    stack: ['OWASP API Top 10', 'PTES VAPT', 'Burp Suite Pro', 'Nmap', 'JWT / OAuth2', 'CVSS v3.1'],
    relatedServiceSlug: 'vapt-penetration-testing',
  },
  {
    id: 'enterprise-client-crm-portal',
    code: 'CS-102',
    pillar: 'development',
    pillarLabel: 'Full-Stack Web & Custom Software',
    title: 'Production Client CRM, Order & Encrypted Deliverables Vault Platform',
    clientSector: 'B2B Consulting & Digital Commerce',
    year: '2026',
    headlineMetric: 'Next.js 16 · Row-Level Security · Atomic Financial Ledger',
    summary:
      'Architected a full-lifecycle client relationship and service commerce platform with proposals, digital RoE sign-off, versioned encrypted deliverables, and multi-currency invoicing.',
    challenge:
      'Traditional freelance workflows fragment communication, files, and invoices across disconnected tools. The goal was a single, high-trust portal for taking orders, delivering files, and retaining clients.',
    approach: [
      'Designed a relational schema with strict Row-Level Security (RLS) and atomic stored procedures.',
      'Integrated an Encrypted Deliverables Vault with SHA-256 checksums and audit-logged presigned downloads.',
      'Built an Antigravity-inspired Tailwind CSS v4 + Motion interface with dark/light theme support.',
    ],
    outcomes: [
      'Unified inquiry -> proposal -> order -> encrypted delivery -> invoice -> retainer pipeline.',
      'Immutable audit trail across payment reviews and deliverable sign-offs.',
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
    clientSector: 'E-Commerce & Cloud SaaS Infrastructure',
    year: '2025',
    headlineMetric: 'Centralized Wazuh SIEM · CIS Linux Hardening & Active Response',
    summary:
      'Centralized Wazuh SIEM deployment with custom MITRE ATT&CK detection rules, File Integrity Monitoring (FIM), CIS Linux hardening, and automated active-response IP blocking.',
    challenge:
      'The client operated distributed Ubuntu and Windows workloads across cloud providers without centralized log visibility, facing repeated credential-stuffing and file-tampering risk.',
    approach: [
      'Provisioned a hardened Wazuh Server, Indexer, and Dashboard cluster with TLS mutual authentication.',
      'Authored custom XML decoders and rules mapped to MITRE ATT&CK techniques for SSH, Nginx, and web application logs.',
      'Applied CIS-aligned hardening across Linux hosts (SSH key-only auth, UFW/nftables, Fail2ban, kernel sysctl tuning).',
    ],
    outcomes: [
      'Centralized real-time SSH, web, and file-integrity alerting in a unified Wazuh dashboard.',
      'Enabled automated active-response blocking against repeated brute-force sources.',
    ],
    stack: ['Wazuh SIEM', 'Ubuntu / Debian', 'MITRE ATT&CK', 'Docker', 'WAF', 'CIS Benchmarks'],
    relatedServiceSlug: 'siem-security-monitoring',
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
      'Traced a domain-impersonation and invoice-redirection campaign targeting executive wire transfers, compiling an evidentiary dossier and executing rapid email/DNS lock-down.',
    challenge:
      'Threat actors registered typosquatted domains and intercepted vendor threads to divert a commercial wire transfer.',
    approach: [
      'Conducted passive DNS, TLS certificate transparency, and header-hop forensic analysis to map attacker infrastructure.',
      'Enforced strict SPF, DKIM, and DMARC p=reject policies alongside conditional access MFA rules.',
      'Submitted abuse evidence packages to registrars and hosting providers to neutralize lookalike domains.',
    ],
    outcomes: [
      'Contained impersonation exposure through registrar abuse filings and email authentication enforcement.',
      'Delivered a structured forensic timeline and executive OPSEC playbook.',
    ],
    stack: ['OSINT', 'Email Forensics', 'DMARC / DKIM / SPF', 'Threat Intelligence', 'Maltego'],
    relatedServiceSlug: 'osint-threat-investigation',
  },
  {
    id: 'q1-ml-healthcare-security',
    code: 'CS-105',
    pillar: 'ai_ml',
    pillarLabel: 'Applied AI/ML & Automation',
    title: 'Published Q1 Scopus & IEEE Machine Learning Pipelines',
    clientSector: 'Academic & Applied AI Research',
    year: '2024–2025',
    headlineMetric: 'Published in Q1 Scopus (Elsevier IJCCE) & IEEE CS BDC Symposium',
    summary:
      'Peer-reviewed machine learning research and reproducible Python pipelines covering market-segmentation clustering and feature-engineered phishing URL detection.',
    challenge:
      'High-stakes predictive models require strong generalization alongside transparent feature engineering that domain practitioners can audit and reproduce.',
    approach: [
      'Engineered end-to-end preprocessing, feature extraction, and model evaluation across clustering and supervised classification pipelines.',
      'Developed URL lexical and host-based feature pipelines for phishing detection research.',
      'Published peer-reviewed papers in Elsevier International Journal of Cognitive Computing in Engineering (Q1 Scopus) and IEEE CS BDC Symposium 2024.',
    ],
    outcomes: [
      'Two peer-reviewed publications with DOI/proceedings verification links on the public curriculum vitae.',
      'Reusable Python preprocessing and evaluation modules adaptable to fraud and phishing analytics.',
    ],
    stack: ['Python', 'Scikit-Learn', 'Feature Engineering', 'Clustering', 'Pandas', 'IEEE / Elsevier Q1'],
    relatedServiceSlug: 'ai-ml-automation',
    externalUrl: '/resume#research',
  },
  {
    id: 'emergency-breach-recovery',
    code: 'CS-106',
    pillar: 'tech_support',
    pillarLabel: 'Executive Tech Support & Digital Recovery',
    title: 'Compromised Production Server & Web Platform Recovery',
    clientSector: 'High-Traffic Media & E-Commerce',
    year: '2025',
    headlineMetric: 'Forensic Malware Eradication · Clean Rebuild & WAF Hardening',
    summary:
      'Emergency containment, webshell/persistence removal, database rescue, and WAF shielding for a compromised Linux production web platform.',
    challenge:
      'An unpatched application component and exposed credential allowed attackers to inject obfuscated malware and cron persistence.',
    approach: [
      'Isolated the host, captured forensic snapshots, and identified modified files and rogue cron/systemd units.',
      'Rebuilt the application runtime on a clean hardened Ubuntu instance, rotated all secrets, and configured strict WAF rules.',
      'Submitted clean verification for search-engine security review.',
    ],
    outcomes: [
      'Restored production cleanly from verified backups after persistence removal and secret rotation.',
      'Transitioned environment onto hardened Nginx/WAF rules and scheduled health checks.',
    ],
    stack: ['Incident Response', 'Linux Forensics', 'Malware Removal', 'WAF Hardening', 'Nginx'],
    relatedServiceSlug: 'executive-tech-support-recovery',
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
  const prefersReducedMotion = useReducedMotion();
  const initialCategory = (searchParams?.get('pillar') ||
    searchParams?.get('category')) as ServicePillarKey | null;

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
              {isActive &&
                (prefersReducedMotion ? (
                  <span className="absolute inset-0 rounded-full bg-primary" />
                ) : (
                  <motion.span
                    layoutId="portfolio-filter-pill"
                    transition={{ type: 'spring', stiffness: 360, damping: 30 }}
                    className="absolute inset-0 rounded-full bg-primary"
                  />
                ))}
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
