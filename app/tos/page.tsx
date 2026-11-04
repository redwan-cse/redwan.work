import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  CreditCard,
  FileCheck2,
  Lock,
  Scale,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AntigravityHeroField } from '@/components/motion/antigravity-hero-field';
import {
  HeroReveal,
  HeroRevealItem,
  InteractiveCard,
  ScrollReveal,
} from '@/components/motion/reveal';
import { SITE } from '@/lib/content/site';

export const metadata: Metadata = {
  title: 'Terms of Service & Rules of Engagement (RoE)',
  description:
    'Terms of Service, C|EH Penetration Testing Rules of Engagement (RoE), deliverable sign-off, and payment terms for redwan.work.',
  alternates: { canonical: '/tos' },
};

const TOS_SECTIONS = [
  { id: 'scope', label: '1. Service Scope' },
  { id: 'roe', label: '2. C|EH Rules of Engagement' },
  { id: 'payments', label: '3. Deposits & Billing' },
  { id: 'deliverables', label: '4. Deliverables & Sign-Off' },
  { id: 'confidentiality', label: '5. Confidentiality & IP' },
  { id: 'liability', label: '6. Warranties & Liability' },
];

export default function TermsOfServicePage() {
  return (
    <div className="flex flex-col">
      {/* Antigravity Hero Header */}
      <section className="relative overflow-hidden border-b border-border/70 py-14 md:py-20">
        <AntigravityHeroField />
        <div className="container relative z-10">
          <HeroReveal className="mx-auto max-w-3xl text-center">
            <HeroRevealItem>
              <Badge variant="outline" className="mb-3 gap-1.5 font-mono text-xs text-primary">
                <ShieldCheck className="h-3.5 w-3.5" />
                LEGAL &amp; ENGAGEMENT GOVERNANCE · C|EH COMPLIANT
              </Badge>
            </HeroRevealItem>
            <HeroRevealItem>
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
                Terms of Service &amp; <span className="text-primary">Rules of Engagement</span>
              </h1>
            </HeroRevealItem>
            <HeroRevealItem>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Clear commercial, technical, and legal terms governing C|EH offensive security assessments, full-stack software engineering, cloud infrastructure, AI automation, and executive support engagements.
              </p>
            </HeroRevealItem>
            <HeroRevealItem>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                {TOS_SECTIONS.map((sec) => (
                  <a
                    key={sec.id}
                    href={`#${sec.id}`}
                    className="rounded-full border border-border/80 bg-card/80 px-3 py-1 font-mono text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    {sec.label}
                  </a>
                ))}
              </div>
            </HeroRevealItem>
          </HeroReveal>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-14">
        <div className="container max-w-7xl">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              Provider: <strong className="text-foreground">{SITE.name}</strong> ({SITE.company.name})
            </span>
            <span className="font-mono">Effective Date: November 4, 2026</span>
          </div>

          <div className="grid gap-8 lg:grid-cols-[340px_1fr]">
            {/* Left Sticky Summary Sidebar */}
            <div className="lg:sticky lg:top-24 lg:self-start">
              <InteractiveCard className="p-6">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Scale className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold">Engagement Summary</h2>
                    <p className="text-xs text-muted-foreground">How portal orders work</p>
                  </div>
                </div>

                <div className="mt-5 space-y-3.5 text-xs leading-relaxed text-muted-foreground">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>
                      <strong className="text-foreground">Defined Scope:</strong> Every engagement is tracked via a numbered Proposal (`PRP-XXXX`) or Order (`ORD-XXXX`).
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>
                      <strong className="text-foreground">Mandatory RoE:</strong> Offensive security testing never begins without signed target ownership authorization.
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>
                      <strong className="text-foreground">7-Day Review Window:</strong> Clients can review, download, and sign off on deliverables or request revisions in the Portal.
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>
                      <strong className="text-foreground">Full IP Transfer:</strong> Custom code and reports transfer to the Client upon final invoice settlement.
                    </span>
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-2 border-t border-border/70 pt-4">
                  <Button asChild size="sm" className="w-full gap-1.5 rounded-full">
                    <Link href="/contact">
                      Request Custom Proposal
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm" className="w-full rounded-full">
                    <Link href="/privacy">View Data &amp; Privacy Policy</Link>
                  </Button>
                </div>
              </InteractiveCard>
            </div>

            {/* Right Detailed Sections */}
            <div className="space-y-8">
              <ScrollReveal>
                <section id="scope" className="scroll-mt-24">
                  <Card className="border-border/80 bg-card/85">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2.5 text-xl">
                        <ShieldCheck className="h-5 w-5 text-primary" />
                        1. Scope of Consulting &amp; Freelance Services
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
                      <p>
                        <strong className="text-foreground">{SITE.name}</strong> provides specialized consulting and execution across five core service pillars: Cybersecurity &amp; Offensive Security (C|EH), Full-Stack Web &amp; Custom Software Engineering, Cloud/DevOps &amp; Linux Infrastructure, Applied AI/ML &amp; Automation, and Executive Tech Support &amp; Digital Recovery.
                      </p>
                      <p>
                        Each engagement is governed by the specific deliverables, milestones, timeline, and pricing defined in the accepted Proposal (`PRP-XXXX`) or Service Package Order (`ORD-XXXX`) inside the Client Portal. Any out-of-scope additions requested after kickoff are quoted via an addendum or milestone adjustment.
                      </p>
                    </CardContent>
                  </Card>
                </section>
              </ScrollReveal>

              <ScrollReveal>
                <section id="roe" className="scroll-mt-24">
                  <Card className="border-amber-500/35 bg-card/85">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2.5 text-xl">
                        <ShieldAlert className="h-5 w-5 text-amber-500" />
                        2. Mandatory Rules of Engagement (RoE) for Offensive Security
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
                      <p>
                        In strict compliance with EC-Council Certified Ethical Hacker (C|EH) standards and applicable computer security laws, active penetration testing, vulnerability scanning (VAPT), or forensic recovery requires a digitally signed{' '}
                        <strong className="text-foreground">
                          Engagement Authorization / Rules of Engagement (RoE)
                        </strong>{' '}
                        inside the Client Portal prior to execution.
                      </p>
                      <p>
                        By signing the RoE, the Client warrants and attests that they are the lawful owner or hold explicit written legal authorization to authorize testing against the listed domains, IP ranges, APIs, cloud accounts, and repositories during the agreed testing window, and designates an emergency technical point of contact.
                      </p>
                    </CardContent>
                  </Card>
                </section>
              </ScrollReveal>

              <ScrollReveal>
                <section id="payments" className="scroll-mt-24">
                  <Card className="border-border/80 bg-card/85">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2.5 text-xl">
                        <CreditCard className="h-5 w-5 text-primary" />
                        3. Deposits, Invoicing &amp; Multi-Currency Settlement
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
                      <p>
                        Fixed-scope packages and custom proposals require the specified kickoff deposit (typically 40%–100% depending on package tier) before order execution transitions to active progress. Monthly retainers are billed at the start of each billing cycle.
                      </p>
                      <p>
                        Official invoices (`INV-XXXX`) may be issued in `USD`, `EUR`, `GBP`, or `BDT` and settled via Bank Wire/SWIFT, Wise, Payoneer, bKash/Nagad, or approved payment channels. Clients upload transfer references and receipts directly in the Client Portal for verification (`PAY-XXXX`).
                      </p>
                    </CardContent>
                  </Card>
                </section>
              </ScrollReveal>

              <ScrollReveal>
                <section id="deliverables" className="scroll-mt-24">
                  <Card className="border-border/80 bg-card/85">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2.5 text-xl">
                        <FileCheck2 className="h-5 w-5 text-primary" />
                        4. Deliverables, Revisions &amp; Acceptance Window
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
                      <p>
                        Versioned deliverables (`DLV-XXXX`) are published to your private{' '}
                        <strong className="text-foreground">Encrypted Deliverables Vault</strong> inside the Client Portal with SHA-256 integrity checksums. Upon submission of a deliverable, the Client has the package-specified review window (default 7 calendar days) to accept the delivery or request a revision within the included revision allowance.
                      </p>
                      <p>
                        If no revision request is submitted within the review window, the deliverable is automatically marked as accepted so the engagement can close cleanly.
                      </p>
                    </CardContent>
                  </Card>
                </section>
              </ScrollReveal>

              <ScrollReveal>
                <section id="confidentiality" className="scroll-mt-24">
                  <Card className="border-border/80 bg-card/85">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2.5 text-xl">
                        <Lock className="h-5 w-5 text-primary" />
                        5. Confidentiality, Vault Retention &amp; Intellectual Property
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
                      <p>
                        All client source code, architecture documentation, vulnerability findings, and forensic artifacts are treated as strictly confidential. Private vault files remain accessible for 90 days following order completion unless extended by an active monthly retainer or retention hold.
                      </p>
                      <p>
                        Upon full settlement of all invoices associated with an order, full ownership and usage rights for custom client deliverables transfer to the Client, while reusable security methodologies and pre-existing frameworks remain the property of the Provider.
                      </p>
                    </CardContent>
                  </Card>
                </section>
              </ScrollReveal>

              <ScrollReveal>
                <section id="liability" className="scroll-mt-24">
                  <Card className="border-border/80 bg-card/85">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2.5 text-xl">
                        <Scale className="h-5 w-5 text-primary" />
                        6. Warranties, Good-Faith Testing &amp; Limitation of Liability
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
                      <p>
                        Security assessments and penetration tests represent a point-in-time evaluation conducted in good faith under the agreed Rules of Engagement. While every reasonable effort is made to identify vulnerabilities and avoid service disruption, security testing cannot guarantee the absence of all future or undisclosed zero-day vulnerabilities.
                      </p>
                      <p>
                        To the maximum extent permitted by applicable law, the Provider&apos;s aggregate liability under any engagement shall not exceed the total fees paid by the Client for the specific order giving rise to the claim.
                      </p>
                    </CardContent>
                  </Card>
                </section>
              </ScrollReveal>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
