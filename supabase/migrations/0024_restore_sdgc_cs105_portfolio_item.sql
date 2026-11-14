-- 0024_restore_sdgc_cs105_portfolio_item.sql
-- Restores CS-105 (Saugatuck Douglas Garden Club) fields after 0022 matched both pre-0018 ('CS-105')
-- and post-0018 ('CS-110') codes when removing IEEE branding from q1-ml-healthcare-security.

update public.portfolio_items
set
  pillar = 'development',
  pillar_label = 'Full-Stack Web & Custom Software',
  title = 'Saugatuck Douglas Garden Club (sdgc.redwan.work) — Web Platform',
  client_sector = 'Non-Profit Community Organization · Michigan, USA (Collaborator Repo)',
  year = '2026',
  headline_metric = 'Cross-Team TypeScript Web Platform · Accessible Community Portal',
  summary = 'Collaborated on the design and full-stack TypeScript implementation of the Saugatuck Douglas Garden Club digital platform (sdgcmich/sdgc-web).',
  challenge = 'The organization required a clean, accessible, mobile-responsive web presence to showcase community horticulture programs, seasonal events, and member resources.',
  approach = array[
    'Engineered responsive pages and reusable component layouts in TypeScript and Next.js.',
    'Calibrated typography, color contrast, and navigation clarity for diverse community demographics.',
    'Configured staging and preview deployments at sdgc.redwan.work for rapid stakeholder review.'
  ],
  outcomes = array[
    'Delivered a fast, maintainable web platform simplifying event discovery and member engagement.',
    'Established clean Git collaboration workflows across contributor branches.'
  ],
  stack = array['TypeScript', 'Next.js', 'Tailwind CSS', 'Responsive UI', 'Accessibility', 'Vercel'],
  related_service_slug = 'fullstack-web-development',
  external_url = 'https://sdgc.redwan.work/',
  is_published = true,
  is_featured = true,
  sort_order = 50
where code = 'CS-105'
  and slug = 'sdgc-michigan-web-platform';
