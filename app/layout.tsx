import "./globals.css";
import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { SITE } from "@/lib/content/site";
import {
  resolveSiteVerificationMetadata,
  serializeJsonLd,
} from "@/lib/seo/metadata";
import { buildRootSiteGraphJsonLd } from "@/lib/seo/structured-data";

const fontSans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

const verification = resolveSiteVerificationMetadata();

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} — ${SITE.shortRole}`,
    template: `%s — ${SITE.name}`,
  },
  description: SITE.tagline,
  keywords:
    "cybersecurity consultant, penetration testing, VAPT, OSINT investigation, Wazuh SIEM, full-stack development, Next.js, Linux hardening, AI ML pipelines, Md. Redwan Ahmed, Fast Cyber Defense",
  ...(verification ? { verification } : {}),
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

const siteGraphJsonLd = buildRootSiteGraphJsonLd();

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
        <link
          rel="alternate"
          type="text/markdown"
          href={`${SITE.url}/llms.txt`}
          title="LLMs Context Summary"
        />
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
