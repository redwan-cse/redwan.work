import { SocialLinks } from "@/components/social-links"

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
        <div className="mt-8 text-center">
            <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Md Redwan Ahmed. All rights reserved.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
            <>
            Founder & CEO - {' '}
              <a href="https://fastcyberdefense.com/" className="hover:underline inline-flex items-center gap-2">
              Fast Cyber Defense
              <img 
                src="https://fastcyberdefense.com/favicon.ico" 
                alt="Fast Cyber Defense Logo" 
                className="w-4 h-4"
              />
              </a>
            </>
            </p>
        </div>
      </div>
    </footer>
  )
}