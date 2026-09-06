# Copilot Instructions

## Project Context
- **Stack**: Next.js 14+ (App Router), TypeScript, Tailwind CSS, shadcn/ui.
- **Core**: Cybersecurity portfolio with Blog (Blogger API), Resume (Printable), and Contact (Google Forms).

## Architecture & Patterns
- **Components**: Default to Server Components. Use `"use client"` only for interactivity.
- **Styling**: Use `cn()` for class merging. Tailwind utility classes preferred.
- **UI Library**: `shadcn/ui` in `components/ui/`. Do not install via npm.
- **Icons**: `lucide-react`.
- **Data Fetching**:
  - **Blogger**: `lib/blogger.ts` uses `googleapis` with base64 credentials (`GOOGLE_CREDENTIALS_B64`).
  - **ISR**: Use `revalidate = 60` or similar for static content.
- **Forms**: Custom implementation submitting to Google Forms (see `enhanced-contact-form.tsx`).

## Development Workflow
- **New Pages**: Create in `app/[route]/page.tsx`.
- **New Components**: Place in `components/` (feature-specific) or `components/ui/` (generic).
- **Theme**: `ThemeProvider` in `layout.tsx` handles `class` based dark mode.
- **PDF**: `components/printable-resume.tsx` uses `@media print` for PDF generation.

## Key Files
- `lib/blogger.ts`: Blog data fetching logic.
- `components/enhanced-contact-form.tsx`: Complex form logic.
- `app/globals.css`: Global styles & CSS variables.
