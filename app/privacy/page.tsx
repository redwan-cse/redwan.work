import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AntigravityHeroField } from '@/components/motion/antigravity-hero-field';
import { HeroReveal, HeroRevealItem } from '@/components/motion/reveal';
import {
  LegalDocumentLayout,
  type LegalSectionItem,
} from '@/components/legal-document-layout';
import { CookiePreferencesTrigger } from '@/components/cookie-preferences';
import { SITE } from '@/lib/content/site';
import { buildPublicMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildPublicMetadata({
  title: 'Data & Privacy Policy',
  description:
    'How your data is collected, used, and protected when you contact Md. Redwan Ahmed or use the Client Portal.',
  path: '/privacy',
});

export default function Privacy() {
  const sections: LegalSectionItem[] = [
    {
      id: 'who-we-are',
      number: 1,
      title: 'Scope & Data Controller',
      content: (
        <>
          <p>
            This website and Client Portal are operated by <strong className="text-foreground">{SITE.name}</strong> (Founder &amp; CEO, <strong className="text-foreground">{SITE.company.name}</strong>). References to &quot;I&quot;, &quot;me&quot;, or &quot;we&quot; refer to {SITE.name} and authorized specialists working under strict confidentiality obligations.
          </p>
          <p>
            This Data &amp; Privacy Policy covers <strong className="text-foreground">redwan.work</strong>, the project intake form at{' '}
            <Link href="/contact" className="text-primary underline underline-offset-4">
              /contact
            </Link>
            , client account registration at{' '}
            <Link href="/register" className="text-primary underline underline-offset-4">
              /register
            </Link>
            , and the authenticated Client Portal at{' '}
            <Link href="/portal" className="text-primary underline underline-offset-4">
              /portal
            </Link>
            .
          </p>
        </>
      ),
    },
    {
      id: 'data-collected',
      number: 2,
      title: 'Information We Collect',
      content: (
        <>
          <p>
            When you submit the contact form, register a Client Portal account, or place a service order, your details are transmitted over TLS/HTTPS and stored in an <strong className="text-foreground">encrypted, row-level access-controlled database</strong> accessible only to authorized personnel.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Fields &amp; Purpose</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium text-foreground">Identity &amp; Contact</TableCell>
                <TableCell className="text-muted-foreground">
                  Full name, email address, optional company name, and optional phone/WhatsApp number to identify you, create your portal account, and deliver proposals or order updates.
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium text-foreground">Project &amp; Order Scope</TableCell>
                <TableCell className="text-muted-foreground">
                  Selected service option, package tier or custom budget offer, project summary, target URLs, and urgency level to evaluate technical scope and prepare contracts.
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium text-foreground">Encrypted Attachments</TableCell>
                <TableCell className="text-muted-foreground">
                  Up to 5 optional files (max 10 MB each in PDF, Word, Excel, PNG, JPG, or ZIP) uploaded directly to our private Encrypted Attachment Vault.
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium text-foreground">Consent &amp; Security Metadata</TableCell>
                <TableCell className="text-muted-foreground">
                  Versioned privacy consent timestamp/hash (`v2`), salted one-way SHA-256 IP hash for rate-limiting, and Turnstile anti-bot verification tokens.
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </>
      ),
    },
    {
      id: 'inquiry-consent-v2',
      number: 3,
      title: 'Inquiry & Attachment Processing Policy (v2)',
      content: (
        <>
          <p>
            When you submit a request through{' '}
            <Link href="/contact" className="text-primary underline underline-offset-4">
              /contact
            </Link>
            , we process your contact details, project summary, and any attached files solely to review your request, prepare a technical response or proposal, and communicate with you via your preferred channel.
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong className="text-foreground">Private Vault Isolation:</strong> Any files attached to your inquiry are stored in a private Cloudflare R2 bucket and are never exposed via public URLs.
            </li>
            <li>
              <strong className="text-foreground">Automatic 90-Day Attachment Purge:</strong> Inquiry attachments are automatically deleted after <strong className="text-foreground">90 days</strong> unless your inquiry converts into an active Client Portal engagement or proposal.
            </li>
            <li>
              <strong className="text-foreground">Confidentiality Warning:</strong> Do not submit raw production passwords, private keys, or unencrypted third-party regulated data in initial inquiry fields; sensitive credentials are exchanged exclusively inside your authenticated Portal workspace after NDA and Rules of Engagement (RoE) execution.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: 'legal-bases',
      number: 4,
      title: 'Legal Bases for Processing',
      content: (
        <>
          <p>
            We process personal data under GDPR-aligned principles of lawfulness, fairness, transparency, purpose limitation, and data minimization:
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong className="text-foreground">Explicit Consent:</strong> Recorded when you agree to this Privacy Policy on our contact form or customize your cookie preferences.
            </li>
            <li>
              <strong className="text-foreground">Contractual &amp; Pre-Contractual Necessity:</strong> Required to register your Client Portal account, issue proposals (<code className="font-mono text-xs text-foreground">PRP-XXXX</code>), execute orders (<code className="font-mono text-xs text-foreground">ORD-XXXX</code>), verify signed Rules of Engagement, and settle invoices (<code className="font-mono text-xs text-foreground">INV-XXXX</code>).
            </li>
            <li>
              <strong className="text-foreground">Legitimate Interests &amp; Legal Obligations:</strong> Maintaining platform security, preventing automated abuse via salted rate-limiting, and retaining statutory accounting records.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: 'data-usage',
      number: 5,
      title: 'How We Use Your Data',
      content: (
        <ul className="list-disc space-y-1.5 pl-5">
          <li>To review and respond to your inquiry and provide technical scoping or custom budget evaluations.</li>
          <li>To provision and authenticate your Client Portal account, manage orders, and deliver versioned reports or code archives.</li>
          <li>To verify Rules of Engagement (RoE) target authorizations prior to offensive security testing.</li>
          <li>To maintain accurate invoicing, payment verification, and audit trail records.</li>
          <li>To protect the website and portal against spam, credential stuffing, and unauthorized access.</li>
        </ul>
      ),
    },
    {
      id: 'retention',
      number: 6,
      title: 'Data Retention Schedule',
      content: (
        <div className="grid gap-3 sm:grid-cols-2">
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
            <h3 className="text-sm font-semibold text-foreground">Security &amp; Rate-Limit Logs</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Audit logs retained for up to <strong className="text-foreground">12 months</strong>. IP addresses for rate-limiting are stored exclusively as salted SHA-256 hashes.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'security',
      number: 7,
      title: 'Infrastructure Security & Access Controls',
      content: (
        <>
          <p>
            We apply defense-in-depth controls modeled on ISO/IEC 27001 and OWASP ASVS standards:
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li><strong className="text-foreground">TLS Encryption in Transit:</strong> Strict HTTPS/TLS across all pages, API endpoints, and direct R2 vault transfers.</li>
            <li><strong className="text-foreground">Row-Level Security (RLS):</strong> Strict database tenant isolation ensuring clients can only access their own orders, files, and invoices.</li>
            <li><strong className="text-foreground">Short-Lived Signed URLs:</strong> Vault downloads use ephemeral 120-second signed links with SHA-256 integrity checksums.</li>
            <li><strong className="text-foreground">Zero Data Brokerage:</strong> Personal and project data is never sold, rented, or shared with data brokers or advertising networks.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'cookies',
      number: 8,
      title: 'Cookie Policy & Preferences',
      content: (
        <>
          <p>
            We use cookies and local storage to ensure our website works properly and to respect your privacy choices:
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong className="text-foreground">Essential Cookies (Required):</strong> Strictly necessary for Client Portal authentication sessions, MFA enforcement, Turnstile anti-bot verification, and storing your cookie consent state.
            </li>
            <li>
              <strong className="text-foreground">Analytics, Marketing &amp; Social/Embeds (Optional):</strong> Disabled by default unless you opt in via our Cookie Preferences manager.
            </li>
          </ul>
          <p>
            You can review or update your cookie choices at any time by clicking <CookiePreferencesTrigger /> in the site footer.
          </p>
        </>
      ),
    },
    {
      id: 'your-rights',
      number: 9,
      title: 'Your Privacy Rights',
      content: (
        <p>
          You have the right to request <strong className="text-foreground">access</strong>, <strong className="text-foreground">rectification</strong>, <strong className="text-foreground">erasure</strong>, <strong className="text-foreground">restriction</strong>, or <strong className="text-foreground">portability</strong> of your personal data, or to withdraw consent at any time. To exercise any right, email{' '}
          <Link
            href="mailto:contact@redwan.work"
            className="font-medium text-primary underline underline-offset-4"
          >
            contact@redwan.work
          </Link>{' '}
          from the address associated with your inquiry or portal account.
        </p>
      ),
    },
    {
      id: 'contact',
      number: 10,
      title: 'Contact for Privacy Matters',
      content: (
        <p>
          For all data protection inquiries, GDPR/privacy requests, or security disclosures, contact <strong className="text-foreground">{SITE.name}</strong> at{' '}
          <Link
            href="mailto:contact@redwan.work"
            className="font-medium text-primary underline underline-offset-4"
          >
            contact@redwan.work
          </Link>{' '}
          or via{' '}
          <Link
            href="/contact"
            className="font-medium text-primary underline underline-offset-4"
          >
            /contact
          </Link>
          .
        </p>
      ),
    },
  ];

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
                This notice explains how information is collected, processed, and protected when you submit an inquiry, register an account, or collaborate through the Client Portal.
              </p>
            </HeroRevealItem>
          </HeroReveal>
        </div>
      </section>

      <LegalDocumentLayout
        subtitleLeft={
          <span>
            Controller: <strong className="text-foreground">{SITE.name}</strong> ({SITE.company.name})
          </span>
        }
        subtitleRight="Last updated: November 2026 (v2)"
        sections={sections}
        footerSlot={
          <div className="flex flex-col gap-2">
            <Button asChild size="sm" className="w-full gap-1.5 rounded-full text-xs">
              <Link href="/contact">
                Submit Inquiry
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="w-full rounded-full text-xs">
              <Link href="/tos">Terms of Service &amp; RoE</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
