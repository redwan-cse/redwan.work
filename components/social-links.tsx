import type { SVGProps } from 'react';
import { GraduationCap, Mail } from 'lucide-react';
import { SITE } from '@/lib/content/site';

export function GithubIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

export function LinkedinIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect width="4" height="12" x="2" y="9" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  );
}

export function OrcidIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="12" cy="12" r="9.5" />
      <line x1="8.25" y1="10.25" x2="8.25" y2="15.75" />
      <circle cx="8.25" cy="7.75" r="0.6" fill="currentColor" />
      <path d="M11.25 10.25h2.1a2.75 2.75 0 0 1 0 5.5h-2.1v-5.5z" />
    </svg>
  );
}

function UpworkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M3.5 7.5v4.2a3.3 3.3 0 0 0 6.6 0V7.5" />
      <path d="M12.5 16.5c1.1-2.5 2.1-4.8 2.9-7" />
      <path d="M13.8 12.2a3.2 3.2 0 1 1 3.2 3.3c-1.5 0-2.6-.9-3.5-2.4" />
    </svg>
  );
}

function FiverrIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M15 17v-6.5H9.5V8.8c0-1.1.7-1.8 1.8-1.8H13" />
      <path d="M7.5 10.5H15" />
      <path d="M9.5 10.5V17" />
      <circle cx="15" cy="7" r="0.8" fill="currentColor" />
    </svg>
  );
}

function FacebookIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

function InstagramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

function XTwitterIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M4 4l6.5 8L4 20h2l5.5-6.8L16 20h4l-6.8-8.4L19.5 4h-2l-5 6.2L8 4H4z" />
    </svg>
  );
}

const socialLinks = [
  {
    name: 'LinkedIn',
    href: SITE.socials.linkedin,
    icon: LinkedinIcon,
    isProfile: true,
  },
  {
    name: 'GitHub',
    href: SITE.socials.github,
    icon: GithubIcon,
    isProfile: true,
  },
  {
    name: 'Google Scholar',
    href: SITE.socials.googleScholar,
    icon: GraduationCap,
    isProfile: true,
  },
  {
    name: 'ORCID',
    href: SITE.socials.orcid,
    icon: OrcidIcon,
    isProfile: true,
  },
  {
    name: 'Upwork',
    href: SITE.socials.upwork,
    icon: UpworkIcon,
    isProfile: true,
  },
  {
    name: 'Fiverr',
    href: SITE.socials.fiverr,
    icon: FiverrIcon,
    isProfile: true,
  },
  {
    name: 'X (Twitter)',
    href: SITE.socials.twitter,
    icon: XTwitterIcon,
    isProfile: true,
  },
  {
    name: 'Facebook',
    href: SITE.socials.facebook,
    icon: FacebookIcon,
    isProfile: true,
  },
  {
    name: 'Instagram',
    href: SITE.socials.instagram,
    icon: InstagramIcon,
    isProfile: true,
  },
  {
    name: 'Email',
    href: `mailto:${SITE.email}`,
    icon: Mail,
    isProfile: false,
  },
];

export function SocialLinks() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      {socialLinks.map((link) => (
        <a
          key={link.name}
          href={link.href}
          target={link.isProfile ? '_blank' : undefined}
          rel={link.isProfile ? 'me noopener noreferrer' : 'noopener noreferrer'}
          title={link.name}
          aria-label={`Visit ${link.name}`}
          className="group inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/80 bg-card/75 text-muted-foreground shadow-2xs backdrop-blur-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/10 hover:text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <link.icon
            className="h-[18px] w-[18px] transition-transform duration-200 group-hover:scale-110"
            aria-hidden="true"
          />
        </a>
      ))}
    </div>
  );
}
