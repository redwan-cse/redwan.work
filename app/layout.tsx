import "./globals.css";
import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { SITE } from "@/lib/content/site";
import { serializeJsonLd } from "@/lib/seo/metadata";

const fontSans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} — ${SITE.shortRole}`,
    template: `%s — ${SITE.name}`,
  },
  description: SITE.tagline,
  keywords:
    "cybersecurity consultant, penetration testing, VAPT, OSINT investigation, Wazuh SIEM, full-stack development, Next.js, Linux hardening, AI ML pipelines, Md. Redwan Ahmed, Fast Cyber Defense",
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: SITE.name,
    title: `${SITE.name} — ${SITE.shortRole}`,
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
    card: "summary",
    title: `${SITE.name} — ${SITE.shortRole}`,
    description: SITE.tagline,
    images: [SITE.profileImage],
  },
  robots: {
    index: true,
    follow: true,
  },
};

const siteGraphJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Person",
      "@id": `${SITE.url}/#person`,
      name: SITE.name,
      url: SITE.url,
      image: `${SITE.url}${SITE.profileImage}`,
      jobTitle: SITE.role,
      email: `mailto:${SITE.email}`,
      worksFor: {
        "@type": "Organization",
        name: SITE.company.name,
        url: SITE.company.url,
      },
      sameAs: Object.values(SITE.socials),
    },
    {
      "@type": "ProfessionalService",
      "@id": `${SITE.url}/#service`,
      name: `${SITE.name} — Security & Engineering Consulting`,
      url: SITE.url,
      founder: { "@id": `${SITE.url}/#person` },
      email: SITE.email,
      areaServed: "Worldwide",
      serviceType: [
        "Penetration Testing & VAPT",
        "OSINT & Digital Fraud Investigation",
        "Wazuh SIEM & Linux Infrastructure Hardening",
        "Full-Stack Web & Client Portal Engineering",
        "Applied AI/ML & Incident Recovery",
      ],
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-title" content="Redwan" />
        <link rel="preconnect" href="https://challenges.cloudflare.com" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(siteGraphJsonLd) }}
        />
      </head>
      <body
        className={`${fontSans.variable} ${fontMono.variable} font-sans antialiased`}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
