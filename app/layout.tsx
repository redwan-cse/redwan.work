import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from "@/components/theme-provider";
import { Navigation } from "@/components/navigation";
import { Footer } from "@/components/footer";
import { WhatsAppButton } from "@/components/whatsapp-button";

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Md Redwan Ahmed - Founder & CEO of Fast Cyber Defense',
  description: 'Professional cybersecurity expert specializing in penetration testing, vulnerability assessments, and security consulting. Founder and CEO of Fast Cyber Defense.',
  keywords: 'cybersecurity, security consultant, penetration testing, vulnerability assessment, Md Redwan Ahmed, Fast Cyber Defense',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
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