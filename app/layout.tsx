import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from "@/components/theme-provider";
import { Navigation } from "@/components/navigation";
import { Footer } from "@/components/footer";
import { WhatsAppButton } from "@/components/whatsapp-button";
import { SITE } from "@/lib/content/site";

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} - ${SITE.role}`,
    template: `%s - ${SITE.name}`,
  },
  description: SITE.tagline,
  keywords:
    'cybersecurity, security consultant, penetration testing, vulnerability assessment, Md Redwan Ahmed, Fast Cyber Defense',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE.url,
    siteName: SITE.name,
    title: `${SITE.name} - ${SITE.role}`,
    description: SITE.tagline,
    images: [
      {
        url: SITE.profileImage,
        width: 800,
        height: 800,
        alt: SITE.name,
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: `${SITE.name} - ${SITE.role}`,
    description: SITE.tagline,
    images: [SITE.profileImage],
  },
  robots: {
    index: true,
    follow: true,
  },
};

const personJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  name: SITE.name,
  url: SITE.url,
  image: `${SITE.url}${SITE.profileImage}`,
  jobTitle: SITE.role,
  email: `mailto:${SITE.email}`,
  worksFor: {
    '@type': 'Organization',
    name: SITE.company.name,
    url: SITE.company.url,
  },
  sameAs: Object.values(SITE.socials),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-title" content="Redwan" />
        {/* Preconnect to Cloudflare Turnstile for performance optimization */}
        <link rel="preconnect" href="https://challenges.cloudflare.com" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd) }}
        />
      </head>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <div className="flex min-h-screen flex-col">
            <Navigation />
            <main className="flex-1">
              {children}
            </main>
            <Footer />
            <WhatsAppButton />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
