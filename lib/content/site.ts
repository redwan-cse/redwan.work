// Single source of truth for site-wide identity values used in
// metadata, JSON-LD, and components.

export const SITE = {
  name: "Md Redwan Ahmed",
  role: "Founder & CEO of Fast Cyber Defense",
  tagline:
    "Professional cybersecurity expert specializing in penetration testing, vulnerability assessments, and security consulting.",
  url: process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://redwan.work",
  email: "contact@redwan.work",
  whatsappNumber: "8801776387624",
  phoneDisplay: "+88017-7638-7624",
  calComUrl: "https://cal.com/redwancse",
  company: {
    name: "Fast Cyber Defense",
    url: "https://fastcyberdefense.com",
  },
  profileImage: "/profile.jpg",
  socials: {
    github: "https://github.com/redwan-cse",
    linkedin: "https://linkedin.com/in/redwancse",
    twitter: "https://twitter.com/redwancse",
    facebook: "https://facebook.com/redwancse",
    instagram: "https://instagram.com/redwancse",
    upwork: "https://www.upwork.com/freelancers/redwancse",
    fiverr: "https://www.fiverr.com/redwancse",
  },
} as const;

export type SiteConfig = typeof SITE;
