import Link from 'next/link';
import { Globe, Mail, MapPin, ShieldCheck } from 'lucide-react';
import { SocialLinks } from '@/components/social-links';
import { CookiePreferencesTrigger } from '@/components/cookie-preferences';
import { SITE } from '@/lib/content/site';

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="print:hidden border-t border-border/80 bg-card/45 text-sm">
      <div className="container py-12 md:py-16">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-12">
          {/* Brand & Executive Summary */}
          <div className="space-y-4 sm:col-span-2 lg:col-span-5 lg:pr-6">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-base font-bold tracking-tight text-foreground">
                {SITE.name}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-background/80 px-2.5 py-0.5 font-mono text-[11px] font-medium text-primary">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                C|EH · CCEP · CNSP · CAP
              </span>
            </div>

            <p className="max-w-md text-xs leading-relaxed text-muted-foreground sm:text-sm">
              Founder &amp; CEO at {SITE.company.name}. Certified Ethical Hacker (C|EH), Full-Stack
              &amp; Cloud Architect, and Q1 Scopus Researcher helping teams ship
              resilient software, harden infrastructure, and resolve high-stakes security incidents.
            </p>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
              <a
                href={`mailto:${SITE.email}`}
                className="inline-flex items-center gap-1.5 font-mono transition-colors hover:text-primary"
              >
                <Mail className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                <span>{SITE.email}</span>
              </a>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                <span>Dhaka, BD · Remote Worldwide</span>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 pt-1 text-xs text-muted-foreground">
              <a
                href={SITE.company.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-background/70 px-3 py-1 transition-colors hover:border-primary/40 hover:text-primary"
              >
                <span>Founder &amp; CEO — {SITE.company.name}</span>
                <Globe className="h-3 w-3" aria-hidden="true" />
              </a>
              <a
                href="https://blogs.redwan.work/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-background/70 px-3 py-1 font-mono text-[11px] transition-colors hover:border-primary/40 hover:text-primary"
              >
                blogs.redwan.work
              </a>
            </div>
          </div>

          {/* Services */}
          <div className="space-y-3 lg:col-span-4">
            <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-foreground">
              Services
            </h2>
            <ul className="space-y-2.5 text-xs text-muted-foreground sm:text-sm">
              <li>
                <Link
                  href="/services?pillar=cybersecurity"
                  className="transition-colors hover:text-primary"
                >
                  Cybersecurity &amp; Penetration Testing (VAPT)
                </Link>
              </li>
              <li>
                <Link
                  href="/services?pillar=development"
                  className="transition-colors hover:text-primary"
                >
                  Full-Stack Web &amp; Custom Software
                </Link>
              </li>
              <li>
                <Link
                  href="/services?pillar=cloud_devops"
                  className="transition-colors hover:text-primary"
                >
                  Cloud, Linux &amp; DevSecOps Hardening
                </Link>
              </li>
              <li>
                <Link href="/services?pillar=ai_ml" className="transition-colors hover:text-primary">
                  Applied AI/ML &amp; Workflow Automation
                </Link>
              </li>
              <li>
                <Link
                  href="/services?pillar=tech_support"
                  className="transition-colors hover:text-primary"
                >
                  Incident Recovery &amp; Monthly Retainers
                </Link>
              </li>
            </ul>
          </div>

          {/* Explore */}
          <div className="space-y-3 lg:col-span-3">
            <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-foreground">
              Explore
            </h2>
            <ul className="space-y-2.5 text-xs text-muted-foreground sm:text-sm">
              <li>
                <Link href="/" className="transition-colors hover:text-primary">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/portfolio" className="transition-colors hover:text-primary">
                  Case Studies &amp; Portfolio
                </Link>
              </li>
              <li>
                <Link href="/resume" className="transition-colors hover:text-primary">
                  Resume &amp; Q1 Research
                </Link>
              </li>
              <li>
                <Link href="/blogs" className="transition-colors hover:text-primary">
                  Security &amp; Tech Blog
                </Link>
              </li>
              <li>
                <Link href="/contact" className="transition-colors hover:text-primary">
                  Start a Project
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Layer 2: Icons-Only Centered Social Links | Layer 3: Copyright & Legal */}
        <div className="mt-10 border-t border-border/70 pt-8">
          <SocialLinks />

          <div className="mt-6 flex flex-col items-center justify-between gap-3 text-xs text-muted-foreground sm:flex-row">
            <p>&copy; {year} {SITE.name}. All rights reserved.</p>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
              <Link href="/privacy" className="transition-colors hover:text-primary hover:underline">
                Privacy Policy
              </Link>
              <span aria-hidden="true">·</span>
              <Link href="/tos" className="transition-colors hover:text-primary hover:underline">
                Terms of Service &amp; RoE
              </Link>
              <span aria-hidden="true">·</span>
              <CookiePreferencesTrigger />
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
