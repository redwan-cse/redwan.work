import type { Metadata } from 'next';
import Link from 'next/link';
import {
  AlertCircle,
  Clock,
  Eye,
  FileText,
  Globe,
  Lock,
  Mail,
  Server,
  Shield,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AntigravityHeroField } from '@/components/motion/antigravity-hero-field';
import {
  HeroReveal,
  HeroRevealItem,
  InteractiveCard,
  ScrollReveal,
} from '@/components/motion/reveal';
import { buildPublicMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildPublicMetadata({
  title: 'Data & Privacy Policy',
  description:
    'How your data is collected, used, and protected when you contact Md. Redwan Ahmed or use the Client Portal.',
  path: '/privacy',
});

const PRIVACY_SECTIONS = [
  { id: 'who-we-are', label: '1. Scope & Controller' },
  { id: 'data-collected', label: '2. Data Collected' },
  { id: 'legal-bases', label: '3. Legal Bases' },
  { id: 'data-usage', label: '4. Data Usage' },
  { id: 'retention', label: '5. Data Retention' },
  { id: 'processing', label: '6. Processing & Sharing' },
  { id: 'security', label: '7. Security Controls' },
  { id: 'your-rights', label: '8. Your Rights' },
  { id: 'cookies', label: '9. Cookies & Edge Security' },
];

export default function Privacy() {
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
                GDPR &amp; ISO/IEC 27001 ALIGNED · DATA PROTECTION
              </Badge>
            </HeroRevealItem>
            <HeroRevealItem>
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
                Data &amp; <span className="text-primary">Privacy Policy</span>
              </h1>
            </HeroRevealItem>
            <HeroRevealItem>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                This notice explains how information is collected, processed, and protected when you submit an inquiry or collaborate through the Client Portal. We collect only what is necessary, protect it with strict access controls, and respect your privacy rights.
              </p>
            </HeroRevealItem>
            <HeroRevealItem>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                {PRIVACY_SECTIONS.map((sec) => (
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
          <div className="mb-8 flex items-center justify-between text-xs text-muted-foreground">
            <span>Transparency &amp; Data Protection Notice</span>
            <span className="font-mono">Last updated: November 4, 2026</span>
          </div>

          <div className="grid gap-8 lg:grid-cols-[340px_1fr]">
            {/* Left Sidebar - At a Glance */}
            <div className="lg:sticky lg:top-24 lg:self-start">
              <InteractiveCard className="p-6">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Eye className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold">At a Glance</h2>
                    <p className="text-xs text-muted-foreground">Core privacy commitments</p>
                  </div>
                </div>

                <div className="mt-5 space-y-3.5 text-xs leading-relaxed text-muted-foreground">
                  <div className="flex gap-3">
                    <div className="w-1 shrink-0 rounded-full bg-primary" />
                    <p>
                      Your details are used strictly to review and respond to your inquiry and to deliver contracted services.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-1 shrink-0 rounded-full bg-primary" />
                    <p>Personal and project data is never sold, rented, or shared with data brokers.</p>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-1 shrink-0 rounded-full bg-primary" />
                    <p>
                      Files uploaded through the Encrypted Attachment Vault or Client Portal are stored in private, access-controlled storage and never exposed publicly.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-1 shrink-0 rounded-full bg-primary" />
                    <p>
                      For abuse prevention, IP addresses are processed as salted one-way cryptographic hashes rather than stored in raw form.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-1 shrink-0 rounded-full bg-primary" />
                    <p>
                      You can request access, correction, or deletion at any time by emailing{' '}
                      <Link
                        href="mailto:contact@redwan.work"
                        className="font-medium text-primary underline underline-offset-4"
                      >
                        contact@redwan.work
                      </Link>
                      .
                    </p>
                  </div>
                </div>
              </InteractiveCard>
            </div>

            {/* Right Column - Main Sections */}
            <div className="space-y-10">
              {/* Section 1 */}
              <ScrollReveal>
                <section id="who-we-are" className="scroll-mt-24">
                  <Card className="border-border/80 bg-card/85">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2.5 text-xl">
                        <Users className="h-5 w-5 text-primary" />
                        1. Who We Are &amp; Scope
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm leading-relaxed text-muted-foreground">
                      <p>
                        This website and Client Portal are operated by{' '}
                        <strong className="text-foreground">Md. Redwan Ahmed</strong> (Founder &amp; CEO, Fast Cyber Defense). References to &quot;I&quot;, &quot;me&quot;, or &quot;we&quot; refer to Md. Redwan Ahmed and authorized specialists working under strict confidentiality obligations.
                      </p>
                      <p>
                        This notice covers <strong className="text-foreground">redwan.work</strong>, the project intake form at{' '}
                        <Link href="/contact" className="text-primary underline underline-offset-4">
                          /contact
                        </Link>
                        , and the authenticated Client Portal at{' '}
                        <Link href="/portal" className="text-primary underline underline-offset-4">
                          /portal
                        </Link>
                        .
                      </p>
                      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                        <div className="flex items-start gap-3">
                          <Mail className="mt-0.5 h-5 w-5 text-primary" />
                          <div>
                            <p className="font-semibold text-foreground">Contact for Privacy Matters</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              For all data protection inquiries or to exercise your rights, email{' '}
                              <Link
                                href="mailto:contact@redwan.work"
                                className="font-medium text-primary underline underline-offset-4"
                              >
                                contact@redwan.work
                              </Link>
                              .
                            </p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </section>
              </ScrollReveal>

              {/* Section 2 */}
              <ScrollReveal>
                <section id="data-collected" className="scroll-mt-24">
                  <Card className="border-border/80 bg-card/85">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2.5 text-xl">
                        <FileText className="h-5 w-5 text-primary" />
                        2. What Data We Collect
                      </CardTitle>
                      <CardDescription>
                        Required intake fields, optional scoping details, and encrypted attachments
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6 text-sm leading-relaxed text-muted-foreground">
                      <p>
                        When you submit the contact form or place an order in the Client Portal, your details are transmitted over TLS/HTTPS and stored in an{' '}
                        <strong className="text-foreground">
                          encrypted, row-level access-controlled database
                        </strong>{' '}
                        accessible only to authorized personnel.
                      </p>
                      <p>
                        You may optionally attach up to{' '}
                        <strong className="text-foreground">5 files (maximum 10 MB each)</strong> in supported document, image, or archive formats (`.pdf`, `.docx`, `.doc`, `.xlsx`, `.png`, `.jpg`, `.zip`). Files are uploaded directly over HTTPS into our{' '}
                        <strong className="text-foreground">Encrypted Attachment Vault</strong>—they are never publicly reachable.
                      </p>

                      <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600 dark:text-amber-400" />
                          <div className="text-xs">
                            <p className="font-semibold text-foreground">Confidentiality &amp; Sensitive Data</p>
                            <p className="mt-1 text-muted-foreground">
                              Do not paste raw production passwords, private keys, or regulated third-party personal data in initial public inquiry text fields. Once an engagement is initiated, credentials and sensitive artifacts are exchanged exclusively inside your authenticated workspace under NDA and Rules of Engagement.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                          <Badge variant="destructive" className="text-[10px]">
                            Required
                          </Badge>
                          Core Inquiry Fields
                        </h3>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Field</TableHead>
                              <TableHead>Purpose</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            <TableRow>
                              <TableCell className="font-medium text-foreground">Full Name &amp; Email</TableCell>
                              <TableCell className="text-muted-foreground">
                                To identify you and deliver proposals, ticket updates, or portal invitations
                              </TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell className="font-medium text-foreground">Country &amp; Time Zone</TableCell>
                              <TableCell className="text-muted-foreground">
                                To coordinate communication windows and regional compliance requirements
                              </TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell className="font-medium text-foreground">Selected Service(s)</TableCell>
                              <TableCell className="text-muted-foreground">
                                To route your inquiry to the appropriate security, engineering, cloud, AI, or support workflow
                              </TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell className="font-medium text-foreground">Project Summary &amp; Urgency</TableCell>
                              <TableCell className="text-muted-foreground">
                                To evaluate technical scope, timelines, and priority response SLAs
                              </TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell className="font-medium text-foreground">Privacy Consent</TableCell>
                              <TableCell className="text-muted-foreground">
                                Cryptographically versioned confirmation (`v1`) of your agreement to data processing
                              </TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>

                      <div>
                        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                          <Badge variant="secondary" className="text-[10px]">
                            Optional
                          </Badge>
                          Scoping &amp; Preference Fields
                        </h3>
                        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                          {[
                            'WhatsApp Number',
                            'Preferred Contact Method',
                            'Preferred Contact Date & Time',
                            'Company / Organization',
                            'Target URL / Scope Notes',
                            'Preferred Package Tier',
                            'NDA / Confidentiality Flag',
                            'Estimated Budget Range (USD)',
                            'Referral / Discovery Source',
                          ].map((field) => (
                            <div
                              key={field}
                              className="flex items-center gap-2 rounded-lg border border-border/70 bg-background/60 px-3 py-2 text-xs"
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                              <span>{field}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </section>
              </ScrollReveal>

              {/* Section 3 */}
              <ScrollReveal>
                <section id="legal-bases" className="scroll-mt-24">
                  <Card className="border-border/80 bg-card/85">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2.5 text-xl">
                        <Shield className="h-5 w-5 text-primary" />
                        3. Legal Bases for Processing
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm leading-relaxed text-muted-foreground">
                      <p>
                        We process personal data under GDPR-aligned principles of lawfulness, fairness, transparency, purpose limitation, and data minimization:
                      </p>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="rounded-xl border border-border/70 bg-background/60 p-4">
                          <h3 className="font-semibold text-foreground">Explicit Consent</h3>
                          <p className="mt-1 text-xs">
                            When you check the consent box on the inquiry form, we record the exact policy version and hash to process your request.
                          </p>
                        </div>
                        <div className="rounded-xl border border-border/70 bg-background/60 p-4">
                          <h3 className="font-semibold text-foreground">Contractual &amp; Pre-Contractual Necessity</h3>
                          <p className="mt-1 text-xs">
                            Processing required to prepare custom proposals (`PRP-XXXX`), execute orders (`ORD-XXXX`), verify signed Rules of Engagement, and issue invoices (`INV-XXXX`).
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </section>
              </ScrollReveal>

              {/* Section 4 */}
              <ScrollReveal>
                <section id="data-usage" className="scroll-mt-24">
                  <Card className="border-border/80 bg-card/85">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2.5 text-xl">
                        <Server className="h-5 w-5 text-primary" />
                        4. How We Use Your Data
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2.5 text-sm text-muted-foreground">
                        {[
                          'To review and respond to your inquiry and provide technical scoping',
                          'To prepare proposals, statements of work, Rules of Engagement (RoE), or service contracts',
                          'To deliver versioned reports, code archives, and support via the Client Portal',
                          'To maintain statutory accounting, invoicing, and payment verification records',
                          'To protect the platform against automated abuse, spam, and unauthorized access',
                        ].map((item) => (
                          <li key={item} className="flex items-start gap-2.5">
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </section>
              </ScrollReveal>

              {/* Section 5 */}
              <ScrollReveal>
                <section id="retention" className="scroll-mt-24">
                  <Card className="border-border/80 bg-card/85">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2.5 text-xl">
                        <Clock className="h-5 w-5 text-primary" />
                        5. Data Retention Schedule
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-4 sm:grid-cols-2">
                      <div className="rounded-xl border border-border/70 bg-background/60 p-4">
                        <h3 className="text-sm font-semibold text-foreground">Inquiries (No Contract)</h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Retained for up to <strong className="text-foreground">24 months</strong> from last interaction, then securely purged or anonymized.
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-background/60 p-4">
                        <h3 className="text-sm font-semibold text-foreground">Vault Attachments &amp; Deliverables</h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Automatically purged after <strong className="text-foreground">90 days</strong> unless retained under an active project or monthly retainer.
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-background/60 p-4">
                        <h3 className="text-sm font-semibold text-foreground">Client Contracts &amp; Invoices</h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Retained for up to <strong className="text-foreground">7 years</strong> to satisfy tax, accounting, and legal audit obligations.
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-background/60 p-4">
                        <h3 className="text-sm font-semibold text-foreground">Security &amp; Audit Logs</h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Retained for up to <strong className="text-foreground">12 months</strong>. IP addresses for rate-limiting are stored exclusively as salted SHA-256 hashes.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </section>
              </ScrollReveal>

              {/* Section 6 & 7 */}
              <ScrollReveal>
                <section id="processing" className="scroll-mt-24">
                  <Card className="border-border/80 bg-card/85">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2.5 text-xl">
                        <Lock className="h-5 w-5 text-primary" />
                        6 &amp; 7. Infrastructure Security &amp; Access Controls
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm text-muted-foreground">
                      <p>
                        We apply defense-in-depth controls modeled on ISO/IEC 27001 and OWASP ASVS standards:
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {[
                          {
                            title: 'TLS Encryption in Transit',
                            desc: 'Strict HTTPS/TLS across all pages, API endpoints, and direct file transfers.',
                          },
                          {
                            title: 'Row-Level Isolation',
                            desc: 'Strict tenant isolation ensuring clients can only access their own orders, files, and invoices.',
                          },
                          {
                            title: 'Short-Lived Signed URLs',
                            desc: 'Vault downloads use ephemeral 120-second signed links with SHA-256 integrity checksums.',
                          },
                          {
                            title: 'Salted IP Hashing',
                            desc: 'Abuse rate-limiting hashes client IPs with a secret server salt; raw IPs are not stored.',
                          },
                          {
                            title: 'Immutable Audit Trail',
                            desc: 'Every proposal acceptance, RoE signature, deliverable download, and payment review is logged.',
                          },
                          {
                            title: 'Zero Data Brokerage',
                            desc: 'Data is never sold or shared with third-party advertisers or marketing networks.',
                          },
                        ].map((item) => (
                          <div
                            key={item.title}
                            className="rounded-xl border border-border/70 bg-background/60 p-3.5"
                          >
                            <div className="text-xs font-bold text-foreground">{item.title}</div>
                            <p className="mt-1 text-xs text-muted-foreground">{item.desc}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </section>
              </ScrollReveal>

              {/* Section 8 & 9 */}
              <ScrollReveal>
                <section id="your-rights" className="scroll-mt-24">
                  <Card className="border-border/80 bg-card/85">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2.5 text-xl">
                        <Globe className="h-5 w-5 text-primary" />
                        8 &amp; 9. Your Privacy Rights, Cookies &amp; Anti-Bot Verification
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm leading-relaxed text-muted-foreground">
                      <p>
                        You have the right to request <strong className="text-foreground">access</strong>,{' '}
                        <strong className="text-foreground">rectification</strong>,{' '}
                        <strong className="text-foreground">erasure</strong>,{' '}
                        <strong className="text-foreground">restriction</strong>, or{' '}
                        <strong className="text-foreground">portability</strong> of your personal data. To exercise any right, email{' '}
                        <Link
                          href="mailto:contact@redwan.work"
                          className="font-medium text-primary underline underline-offset-4"
                        >
                          contact@redwan.work
                        </Link>{' '}
                        from the address associated with your inquiry or portal account.
                      </p>
                      <p id="cookies">
                        <strong className="text-foreground">Cookies &amp; Edge Verification:</strong> We use only strictly necessary session cookies for authenticated Client Portal access and privacy-preserving anti-bot verification on public forms. We do not use third-party advertising trackers.
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
