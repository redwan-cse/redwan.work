# Md Redwan Ahmed - Portfolio & Professional Website

Personal portfolio website for **Md Redwan Ahmed** (Founder & CEO of Fast Cyber Defense), a cybersecurity professional specializing in penetration testing, vulnerability assessment, and security consulting.

**Live Site:** [redwan.work](https://redwan.work)

## Tech Stack

- **Framework:** Next.js 14+ (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS + shadcn/ui
- **Deployment:** Vercel
- **CMS:** Google Blogger (for blog posts)
- **Bot Protection:** Cloudflare Turnstile
- **Icons:** Lucide React

## Key Features

### 🎯 Fully Implemented

- **Blogs Page** - Fetches posts from Google Blogger with pagination (9 posts/page), card layout with hover effects, and preview modal for quick viewing without leaving the site.
- **Resume Page** - Interactive web resume with print-to-PDF functionality. Content stays synchronized between web and PDF versions.
- **Contact Form** - Rich lead capture form with Google Forms backend, **Cloudflare Turnstile bot protection**, field validation popup, automatic ticket ID generation, country/timezone auto-detection, and WhatsApp/email contact options.
- **Dark/Light Mode** - Theme switcher with persistent storage and system preference detection.
- **Responsive Design** - Mobile-first approach, works seamlessly across all devices.

### 🚧 Under Active Development

- **Home Page** - Currently has hero section; additional sections (services highlights, case studies, featured projects) planned.
- **Portfolio Page** - Project showcase structure in place; case studies and detailed project pages being added.
- **Services Page** - Service listing exists; expanding with detailed service descriptions and pricing

### Development
- **ESLint** - Code linting with Next.js config
- **PostCSS & Autoprefixer** - CSS processing
- **date-fns** - Date formatting and manipulation

### Deployment
- **Vercel** - Edge deployment with automatic SSL and CDN
- **Git** - Version control via GitHub

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm/pnpm
- Environment variables configured (see below)


## Project Structure

```
redwan.work/
├── app/                  # Next.js App Router pages
│   ├── page.tsx         # Home page
│   ├── blogs/           # Blog listing & pagination
│   ├── contact/         # Contact form
│   ├── resume/          # Interactive resume
│   ├── portfolio/       # Project showcase
│   ├── services/        # Services listing
│   └── api/             # API routes (revalidation, PDF)
├── components/           # React components
│   ├── ui/              # shadcn/ui components (56 total)
│   ├── navigation.tsx   # Header with responsive nav
│   ├── footer.tsx       # Footer with social links
│   ├── enhanced-contact-form.tsx
│   ├── blog-preview-modal.tsx
│   └── printable-resume.tsx
├── lib/                 # Utilities
│   ├── blogger.ts       # Blogger API integration
│   ├── countries-data.ts # Country/timezone data
│   └── utils.ts         # Helper functions
├── hooks/               # Custom React hooks
├── public/              # Static assets
└── docs/                # Documentation (see below)
```

## Running Locally

**Prerequisites:**
- Node.js 18+ (or use pnpm/npm/yarn)
- Environment variables configured (see below)

**Install dependencies:**
```bash
pnpm install
```

**Run development server:**
```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

**Build for production:**
```bash
pnpm build
pnpm start
```

## Environment Variables

Create a `.env.local` file in the project root:

```env
# Required for blog functionality
BLOGGER_ID=your_blogger_blog_id
GOOGLE_CREDENTIALS_B64=base64_encoded_service_account_json

# Required for contact form
NEXT_PUBLIC_GOOGLE_FORM_ACTION_URL=https://docs.google.com/forms/d/e/FORM_ID/formResponse

# Required for Cloudflare Turnstile (bot protection)
NEXT_PUBLIC_TURNSTILE_SITE_KEY=your_turnstile_site_key
TURNSTILE_SECRET_KEY=your_turnstile_secret_key

# Optional
REVALIDATION_SECRET=your_secret_for_api_revalidation
```

**Google Blogger Setup:**
1. Create a Google Cloud Service Account
2. Enable Blogger API v3
3. Download service account JSON
4. Base64 encode: `cat service-account.json | base64`
5. Add to environment variables

**Google Forms Setup:**
1. Create a Google Form with 19 fields (see `/docs/contact/`)
2. Get the form action URL (replace `/viewform` with `/formResponse`)
3. Add to `NEXT_PUBLIC_GOOGLE_FORM_ACTION_URL`

**Cloudflare Turnstile Setup:**
1. Enable Turnstile in your Cloudflare dashboard
2. Add your domain (redwan.work)
3. Copy Site Key and Secret Key
4. Add to environment variables (see `/docs/contact/turnstile-integration.md` for details)

## Documentation

Detailed documentation for each feature is in the `/docs` folder:

- **[/docs/blogs/](./docs/blogs/)** - Blog integration, pagination, preview modal, and maintenance
- **[/docs/resume/](./docs/resume/)** - Resume system, PDF export, and how to update content
- **[/docs/contact/](./docs/contact/)** - Contact form fields, validation, Google Forms integration
- **[/docs/home/](./docs/home/)** - Home page structure and planned features
- **[/docs/portfolio/](./docs/portfolio/)** - Portfolio showcase (work in progress)
- **[/docs/services/](./docs/services/)** - Services listing (work in progress)
- **[/docs/ai_review/](./docs/ai_review/)** - AI code review notes and improvements

## Deployment

Deployed on **Vercel** with automatic builds on push to `main` branch.

**Deployment checklist:**
- Environment variables configured in Vercel dashboard
- Custom domain `redwan.work` connected
- SSL configured automatically
- ISR (Incremental Static Regeneration) enabled for blogs (60s revalidation)

## Development Guidelines

- **Server Components** by default (for SEO and performance)
- **Client Components** (`"use client"`) only when needed (interactive elements)
- Use `cn()` utility for conditional classes (from `@/lib/utils`)
- Follow TypeScript strict mode
- Keep components small and focused
- Use shadcn/ui components for consistency

## Contributing

This is a personal portfolio, but suggestions and bug reports are welcome:

- **Email:** contact@redwan.work
- **LinkedIn:** [linkedin.com/in/redwancse](https://linkedin.com/in/redwancse)
- **GitHub:** [github.com/redwan-cse](https://github.com/redwan-cse)

## License

All Rights Reserved © 2025 Md Redwan Ahmed

