// Client testimonials shown on the home page.

export interface Testimonial {
  name: string;
  role: string;
  image: string;
  content: string;
  rating: number;
}

export const TESTIMONIALS: Testimonial[] = [
  {
    name: "John Smith",
    role: "CTO, TechSecure Inc",
    image:
      "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&h=400&fit=crop",
    content:
      "Redwan's penetration testing services were instrumental in identifying critical vulnerabilities in our infrastructure. His detailed reports and remediation suggestions were invaluable.",
    rating: 5,
  },
  {
    name: "Sarah Johnson",
    role: "Security Director, FinTech Solutions",
    image:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop",
    content:
      "The thoroughness of the security audit exceeded our expectations. Redwan's expertise in cloud security helped us achieve compliance with industry standards.",
    rating: 5,
  },
  {
    name: "Michael Chen",
    role: "CEO, DataGuard Systems",
    image:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop",
    content:
      "Working with Redwan on our red team engagement was eye-opening. His methodical approach to security testing revealed vulnerabilities we hadn't considered.",
    rating: 5,
  },
  {
    name: "Emily Rodriguez",
    role: "CISO, Healthcare Solutions",
    image:
      "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=400&fit=crop",
    content:
      "The incident response training Redwan provided was exceptional. Our team is now better prepared to handle security incidents thanks to his expertise.",
    rating: 5,
  },
  {
    name: "David Park",
    role: "IT Manager, E-commerce Plus",
    image:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop",
    content:
      "Redwan's OSINT capabilities are remarkable. His investigation helped us identify and mitigate potential security risks before they could be exploited.",
    rating: 5,
  },
  {
    name: "Lisa Thompson",
    role: "DevOps Lead, CloudTech",
    image:
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=400&fit=crop",
    content:
      "The security implementation in our CI/CD pipeline has significantly improved thanks to Redwan's expertise. His attention to detail is outstanding.",
    rating: 5,
  },
  {
    name: "Robert Wilson",
    role: "COO, SecureNet",
    image:
      "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&h=400&fit=crop",
    content:
      "Redwan's system hardening services helped us establish a robust security posture. His recommendations were practical and effective.",
    rating: 5,
  },
  {
    name: "Anna Martinez",
    role: "Security Analyst, BankSecure",
    image:
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=400&fit=crop",
    content:
      "The digital forensics investigation conducted by Redwan was thorough and professional. His expertise helped us understand and prevent future incidents.",
    rating: 5,
  },
];
