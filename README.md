# redwan.work (Fresh Start)

Personal portfolio and full-stack client CRM for **Md Redwan Ahmed** ([redwan.work](https://redwan.work)).

This repository is a fresh rewrite of `redwan.work` started from scratch.

---

## Legacy / Reference Project

The complete previous codebase, history, and documentation have been archived and preserved:

- **Local Path:** `J:\DevDrive\redwan.work_old`
- **GitHub Repository:** [`redwan-cse/redwan.work_old`](https://github.com/redwan-cse/redwan.work_old)

For full architectural details, schema summaries, environment configurations, and feature specifications, consult:
- [`docs/LEGACY_ARCHITECTURE.md`](./docs/LEGACY_ARCHITECTURE.md)
- [`AGENTS.md`](./AGENTS.md) (guidance for AI assistants working in this repository)

---

## Planned Architecture & Scope

### 1. Public Portfolio
- Professional branding & cyber security portfolio for Md Redwan Ahmed
- Interactive web resume (with print-to-PDF support)
- Blog posts & articles (previously integrated with Google Blogger API)
- Contact & lead capture with bot protection (Cloudflare Turnstile) and rate limiting
- Dark / Light mode theming

### 2. Client CRM (Admin & Client Portal)
- **Role-Based Authentication:** Admin vs Client access with invitation flow
- **Client Portal:** Project overview, deliverables, ticket discussions, invoices, and payments
- **Admin Dashboard:** Client management, project milestones, file deliveries, invoice issuance, and payment verification
- **Ticketing System:** Threaded communication between clients and admin with status workflows
- **Invoicing & Payments:** Invoice generation, PDF export, bank transfer/online payments, status state machine
- **Storage & Deliverables:** Cloudflare R2 bucket integration for direct presigned uploads and secure downloads
- **Lifecycle Notifications:** Transactional emails (Resend) with audit log

---

## For Developers & AI Agents

When building or scaffolding new features in this repository, check [`AGENTS.md`](./AGENTS.md) and [`docs/LEGACY_ARCHITECTURE.md`](./docs/LEGACY_ARCHITECTURE.md). You can inspect and reference existing schemas, utilities, components, and patterns directly from `J:\DevDrive\redwan.work_old`.
