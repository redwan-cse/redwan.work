import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AntigravityHeroField } from '@/components/motion/antigravity-hero-field';
import { HeroReveal, HeroRevealItem } from '@/components/motion/reveal';
import {
  LegalDocumentLayout,
  type LegalSectionItem,
} from '@/components/legal-document-layout';
import { SITE } from '@/lib/content/site';
import { buildPublicMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildPublicMetadata({
  title: 'Terms of Service & Rules of Engagement (RoE)',
  description:
    'Terms of Service, Penetration Testing Rules of Engagement (RoE), deliverable sign-off, and payment terms for redwan.work.',
  path: '/tos',
});

export default function TermsOfServicePage() {
  const sections: LegalSectionItem[] = [
    {
      id: 'acceptance',
      number: 1,
      title: 'Acceptance of Terms',
      content: (
        <>
          <p>
            By accessing <strong className="text-foreground">redwan.work</strong>, submitting a project inquiry, registering a Client Portal account, or engaging <strong className="text-foreground">{SITE.name}</strong> ({SITE.company.name}) for professional services, you agree to be bound by these Terms of Service and all applicable Rules of Engagement (RoE).
          </p>
          <p>
            If you are entering into these terms on behalf of a company or organization, you represent and warrant that you have authority to bind that entity to these terms.
          </p>
        </>
      ),
    },
    {
      id: 'services',
      number: 2,
      title: 'Services & Engagements',
      content: (
        <>
          <p>
            <strong className="text-foreground">{SITE.name}</strong> provides specialized consulting and execution across five core service pillars: Cybersecurity &amp; Offensive Security (VAPT &amp; OSINT), Full-Stack Web &amp; Custom Software Engineering, Cloud/DevOps &amp; Linux Infrastructure, Applied AI/ML &amp; Automation, and Executive Tech Support &amp; Digital Recovery.
          </p>
          <p>
            Each engagement is governed by the specific deliverables, milestones, timeline, and pricing defined in the accepted Proposal (<code className="font-mono text-xs text-foreground">PRP-XXXX</code>) or Service Package Order (<code className="font-mono text-xs text-foreground">ORD-XXXX</code>) inside the Client Portal. Fixed-scope packages and custom proposals require the specified kickoff deposit (typically 40%–100% depending on package tier) before order execution transitions to active progress.
          </p>
          <p>
            Versioned deliverables (<code className="font-mono text-xs text-foreground">DLV-XXXX</code>) are published to your private <strong className="text-foreground">Encrypted Deliverables Vault</strong> inside the Client Portal with SHA-256 integrity checksums and a default 7-day review window.
          </p>
        </>
      ),
    },
    {
      id: 'responsibilities',
      number: 3,
      title: 'Client Responsibilities & Rules of Engagement (RoE)',
      content: (
        <>
          <p>
            Clients engaging <strong className="text-foreground">{SITE.name}</strong> and <strong className="text-foreground">{SITE.company.name}</strong> agree to:
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Provide accurate and complete information required for service delivery.</li>
            <li>
              Obtain and digitally sign all necessary <strong className="text-foreground">Rules of Engagement (RoE)</strong> authorizations before penetration testing or vulnerability scanning begins (confirming lawful ownership or explicit written permission for all in-scope systems).
            </li>
            <li>Ensure that requested testing activities do not violate any third-party hosting agreements or applicable laws.</li>
            <li>Promptly review and act on deliverables, findings reports, and milestone sign-offs within the Portal review window.</li>
            <li>Maintain the confidentiality of any portal credentials, signed download links, or emergency escalation contacts.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'acceptable-use',
      number: 4,
      title: 'Acceptable Use',
      content: (
        <>
          <p>Use of this website and Client Portal is permitted for lawful purposes only. You must not:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Attempt to gain unauthorized access to any part of the website, Client Portal, server, or associated infrastructure.</li>
            <li>Transmit any unsolicited commercial communications (spam) or malicious payloads through intake or attachment forms.</li>
            <li>Use the site in any way that could damage, disable, overburden, or impair its operation.</li>
            <li>Submit false, fraudulent, or misleading information through contact, registration, or order forms.</li>
            <li>Scrape, copy, or automatically harvest personal biodata, curriculum vitae records, or proprietary content without written permission.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'intellectual-property',
      number: 5,
      title: 'Intellectual Property',
      content: (
        <>
          <p>
            All personal biodata, resume history, photography, branding, case-study narratives, and reports on this website are the exclusive intellectual property of <strong className="text-foreground">{SITE.name}</strong> and <strong className="text-foreground">{SITE.company.name}</strong>, protected under applicable copyright and trademark laws.
          </p>
          <p>
            Client deliverables (such as custom application code, automation scripts, and penetration test reports) are licensed or assigned to the commissioning Client for their internal or commercial use upon full settlement of all issued invoices (<code className="font-mono text-xs text-foreground">INV-XXXX</code>). {SITE.name} retains ownership of pre-existing methodologies, reusable security frameworks, and general engineering know-how.
          </p>
        </>
      ),
    },
    {
      id: 'confidentiality',
      number: 6,
      title: 'Confidentiality',
      content: (
        <>
          <p>
            All client source code, architecture documentation, vulnerability findings, credentials, and forensic artifacts shared during an engagement are treated as strictly confidential and are never disclosed to third parties without explicit client consent.
          </p>
          <p>
            Private files stored in the Encrypted Attachment Vault or Client Portal Deliverables Vault are protected by tenant-isolated access controls and automatically purged after 90 days following order completion unless extended by an active monthly retainer.
          </p>
        </>
      ),
    },
    {
      id: 'liability',
      number: 7,
      title: 'Limitation of Liability',
      content: (
        <>
          <p>
            Security assessments, penetration testing, and code audits represent a point-in-time evaluation conducted under agreed scope constraints and do not guarantee that a system is impervious to all future or zero-day attacks.
          </p>
          <p>
            To the maximum extent permitted by applicable law, the total aggregate liability of <strong className="text-foreground">{SITE.name}</strong> and <strong className="text-foreground">{SITE.company.name}</strong> arising out of or relating to any engagement shall not exceed the total fees actually paid by the Client for the specific order giving rise to the claim.
          </p>
        </>
      ),
    },
    {
      id: 'governing-law',
      number: 8,
      title: 'Governing Law',
      content: (
        <>
          <p>
            These Terms of Service and any dispute or claim arising out of or in connection with them or any service engagement shall be governed by and construed in accordance with the laws of <strong className="text-foreground">Bangladesh</strong>, with good-faith commercial arbitration or mediation prior to formal proceedings.
          </p>
        </>
      ),
    },
    {
      id: 'changes',
      number: 9,
      title: 'Changes to These Terms',
      content: (
        <>
          <p>
            We may update these Terms of Service from time to time to reflect operational, legal, or regulatory changes. Updated terms take effect upon publication on this page, while active signed orders continue under the terms in effect at order confirmation unless mutually amended.
          </p>
        </>
      ),
    },
    {
      id: 'contact',
      number: 10,
      title: 'Contact',
      content: (
        <>
          <p>
            For questions regarding these Terms of Service, Rules of Engagement, or custom enterprise agreements, please contact{' '}
            <Link
              href="mailto:contact@redwan.work"
              className="font-medium text-primary underline underline-offset-4"
            >
              contact@redwan.work
            </Link>{' '}
            or submit an inquiry via{' '}
            <Link
              href="/contact"
              className="font-medium text-primary underline underline-offset-4"
            >
              /contact
            </Link>
            .
          </p>
        </>
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
                LEGAL &amp; ENGAGEMENT GOVERNANCE · ROE AUTHORIZED
              </Badge>
            </HeroRevealItem>
            <HeroRevealItem>
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
                Terms of Service &amp; <span className="text-primary">Rules of Engagement</span>
              </h1>
            </HeroRevealItem>
            <HeroRevealItem>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Clear commercial, technical, and legal terms governing offensive security assessments, full-stack software engineering, cloud infrastructure, AI automation, and executive support engagements.
              </p>
            </HeroRevealItem>
          </HeroReveal>
        </div>
      </section>

      <LegalDocumentLayout
        subtitleLeft={
          <span>
            Provider: <strong className="text-foreground">{SITE.name}</strong> ({SITE.company.name})
          </span>
        }
        subtitleRight="Effective Date: November 2026"
        sections={sections}
        footerSlot={
          <div className="flex flex-col gap-2">
            <Button asChild size="sm" className="w-full gap-1.5 rounded-full text-xs">
              <Link href="/services">
                Order Service
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="w-full rounded-full text-xs">
              <Link href="/privacy">Privacy Policy</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
