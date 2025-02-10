import {
  Github,
  Linkedin,
  Facebook,
  Instagram,
  Twitter,
  Mail,
  Globe,
  MessageSquare,
} from "lucide-react"

const socialLinks = [
  {
    name: "Facebook",
    href: "https://facebook.com/redwancse",
    icon: Facebook,
    color: "#1877F2",
  },
  {
    name: "Twitter",
    href: "https://twitter.com/redwancse",
    icon: Twitter,
    color: "#1DA1F2",
  },
  {
    name: "LinkedIn",
    href: "https://linkedin.com/in/redwancse",
    icon: Linkedin,
    color: "#0A66C2",
  },
  {
    name: "Instagram",
    href: "https://instagram.com/redwancse",
    icon: Instagram,
    color: "#E4405F",
  },
  {
    name: "GitHub",
    href: "https://github.com/redwan-cse",
    icon: Github,
    color: "#333",
  },
  {
    name: "Upwork",
    href: "https://www.upwork.com/freelancers/redwancse",
    icon: Globe,
    color: "#6FDA44",
  },
  {
    name: "Fiverr",
    href: "https://www.fiverr.com/redwancse",
    icon: MessageSquare,
    color: "#1DBF73",
  },
  {
    name: "Email",
    href: "mailto:info@redwan.work",
    icon: Mail,
    color: "#EA4335",
  },
]

export function SocialLinks() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-6">
      {socialLinks.map((link) => (
        <a
          key={link.name}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center justify-center rounded-full p-2 transition-colors hover:bg-muted"
          aria-label={`Visit ${link.name}`}
        >
          <link.icon
            className="h-6 w-6 transition-transform group-hover:scale-110"
            style={{ color: link.color }}
            aria-hidden="true"
          />
        </a>
      ))}
    </div>
  )
}