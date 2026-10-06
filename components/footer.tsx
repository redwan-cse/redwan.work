import { SocialLinks } from "@/components/social-links"
import { Globe } from "lucide-react"

export function Footer() {
  return (
    <footer className="w-full border-t bg-background">
      <div className="container py-12">
        <div className="mb-8 text-center">
          <h2 className="mb-4 text-2xl font-bold">Connect With Me</h2>
          <p className="text-muted-foreground">
            Follow me on social media or reach out directly
          </p>
        </div>
        <SocialLinks />
        <div className="mt-8 text-center space-y-2">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Md Redwan Ahmed. All rights reserved.
          </p>
          <p className="text-sm text-muted-foreground">
            Cybersecurity Research Publication:{' '}
            <a
              href="https://blogs.redwan.work/"
              className="hover:underline text-primary font-medium inline-flex items-center gap-1.5"
              target="_blank"
              rel="noopener noreferrer"
            >
              blogs.redwan.work
            </a>
          </p>
          <p className="text-sm text-muted-foreground">
            Founder &amp; CEO -{' '}
            <a href="https://fastcyberdefense.com/" className="hover:underline inline-flex items-center gap-2">
              Fast Cyber Defense
              <Globe className="w-4 h-4" aria-hidden="true" />
            </a>
          </p>
        </div>
      </div>
    </footer>
  )
}
