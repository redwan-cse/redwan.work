import Link from 'next/link';
import { Globe, Lock, ShieldCheck } from 'lucide-react';
import { SocialLinks } from '@/components/social-links';
import { CookiePreferencesTrigger } from '@/components/cookie-preferences';
import { SITE } from '@/lib/content/site';

export function Footer() {
  return (
    <footer className="w-full border-t border-border/80 bg-card/40">
      <div className="container py-14">
        <div className="grid gap-10 md:grid-cols-12">
          {/* Brand Column */}
          <div className="space-y-4 md:col-span-5">
            <div className="flex items-center gap-2.5">
              <span className="text-xl font-bold tracking-tight">{SITE.name}</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 font-mono text-xs font-semibold text-primary">
                <ShieldCheck className="h-3.5 w-3.5" />
                CCEP · CNSP · CAP
              </span>
            </div>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              {SITE.tagline}
            </p>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1">
                Founder &amp; CEO —{' '}
                <a
                  href={SITE.company.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-foreground hover:text-primary"
                >
                  {SITE.company.name}
                  <Globe className="h-3.5 w-3.5" />
                </a>
              </span>
              <a
                href="https://blogs.redwan.work/"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-border bg-background px-2.5 py-1 font-mono hover:border-primary/50 hover:text-primary"
              >
                blogs.redwan.work
              </a>
            </div>
          </div>

          {/* Service Pillars Column */}
          <div className="space-y-3 md:col-span-4">
            <h3 className="font-mono text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Service Pillars
            </h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/services?pillar=cybersecurity" className="hover:text-primary">
                  Cybersecurity &amp; Penetration Testing (VAPT)
                </Link>
              </li>
              <li>
                <Link href="/services?pillar=development" className="hover:text-primary">
                  Full-Stack Web &amp; Custom Software Engineering
                </Link>
              </li>
              <li>
                <Link href="/services?pillar=cloud_devops" className="hover:text-primary">
                  Cloud, DevOps &amp; Linux Server Hardening
                </Link>
              </li>
              <li>
                <Link href="/services?pillar=ai_ml" className="hover:text-primary">
                  Applied AI/ML &amp; Workflow Automation
                </Link>
              </li>
              <li>
                <Link href="/services?pillar=tech_support" className="hover:text-primary">
                  Emergency Incident Recovery &amp; Monthly Retainers
                </Link>
              </li>
            </ul>
          </div>

          {/* Navigation & Portal Column */}
          <div className="space-y-3 md:col-span-3">
            <h3 className="font-mono text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Navigation &amp; Client Access
            </h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/portfolio" className="hover:text-primary">
                  Case Studies &amp; Portfolio
                </Link>
              </li>
              <li>
                <Link href="/resume" className="hover:text-primary">
                  Resume, Certifications &amp; Q1 Research
                </Link>
              </li>
              <li>
                <Link href="/blogs" className="hover:text-primary">
                  Security &amp; Engineering Blogs
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-primary">
                  Direct Project Inquiry
                </Link>
              </li>
              <li>
                <Link
                  href="/portal"
                  className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
                >
                  <Lock className="h-3.5 w-3.5" />
                  Client Portal &amp; Order Tracker
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-border/70 pt-8">
          <SocialLinks />
          <div className="mt-6 flex flex-col items-center justify-between gap-3 text-xs text-muted-foreground sm:flex-row">
            <p>© {new Date().getFullYear()} {SITE.name}. All rights reserved.</p>
            <div className="flex flex-wrap items-center gap-4">
              <Link href="/privacy" className="hover:text-primary hover:underline">
                Privacy Policy
              </Link>
              <span aria-hidden="true">·</span>
              <Link href="/tos" className="hover:text-primary hover:underline">
                Terms of Service &amp; RoE
              </Link>
              <span aria-hidden="true">·</span>
              <CookiePreferencesTrigger />
              <span aria-hidden="true">·</span>
              <Link href="/admin" className="hover:text-primary hover:underline">
                Command Center
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
