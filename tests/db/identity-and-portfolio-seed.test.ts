import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDisposablePostgres, type DisposablePostgres } from '../harness/disposable-pg.mjs';

describe('Database Seed Identity & Portfolio Truthfulness', () => {
  let pg: DisposablePostgres;

  beforeAll(async () => {
    pg = await createDisposablePostgres();
  }, 60_000);

  afterAll(async () => {
    if (pg) {
      await pg.close();
    }
  });

  it('reconciles site_settings with verified resume identity, credentials, and references', async () => {
    const res = await pg.db.query<{
      full_name: string;
      role_title: string;
      short_role: string;
      subtitle: string;
      tagline: string;
      executive_summary: string;
      email: string;
      credentials: Array<{ code: string; label: string }>;
      technical_skills: Record<string, string[]>;
      references_list: Array<{ name: string; email: string }>;
    }>(`select * from public.site_settings where id = 'default'`);

    expect(res.rows).toHaveLength(1);
    const settings = res.rows[0];
    expect(settings.full_name).toBe('Md. Redwan Ahmed');
    expect(settings.email).toBe('contact@redwan.work');

    const serialized = JSON.stringify(settings);
    expect(serialized).not.toMatch(/C\|EH/i);
    expect(serialized).not.toMatch(/Certified Ethical Hacker/i);

    const codes = settings.credentials.map((c) => c.code);
    expect(codes).toContain('CCEP');
    expect(codes).toContain('CNSP');
    expect(codes).toContain('CAP');
    expect(codes).not.toContain('C|EH');

    const layek = settings.references_list.find((r) => r.name.includes('Abu Layek'));
    expect(layek?.email).toBe('abulayek@yahoo.com');
  });

  it('removes unverified C|EH vendor certification and aligns BSc graduation year to 2021 in resume_items', async () => {
    const certs = await pg.db.query<{ section: string; title: string; organization: string }>(
      `select section, title, organization from public.resume_items`
    );
    const serialized = JSON.stringify(certs.rows);
    expect(serialized).not.toMatch(/C\|EH/i);
    expect(serialized).not.toMatch(/Certified Ethical Hacker/i);

    // EC-Council Learning course certificate remains under professional_certificate
    const ecCourse = certs.rows.find((r) => r.title === 'Mastering Ethical Hacking Tools');
    expect(ecCourse?.section).toBe('professional_certificate');

    const bsc = await pg.db.query<{ period: string }>(
      `select period from public.resume_items where section = 'education' and title = 'BSc in Computer Science & Engineering'`
    );
    expect(bsc.rows[0]?.period).toBe('2021 · CGPA: 3.15/4.00');
  });

  it('removes C|EH claims and unverified statistics from services and portfolio_items', async () => {
    const services = await pg.db.query<{ slug: string; title: string; tagline: string; description: string; highlights: string[] }>(
      `select slug, title, tagline, description, highlights from public.services`
    );
    expect(JSON.stringify(services.rows)).not.toMatch(/C\|EH/i);
    expect(JSON.stringify(services.rows)).not.toMatch(/Certified Ethical Hacker/i);

    const validSlugs = new Set(services.rows.map((s) => s.slug));

    const portfolio = await pg.db.query<{
      code: string;
      headline_metric: string;
      summary: string;
      challenge: string;
      outcomes: string[];
      stack: string[];
      related_service_slug: string | null;
    }>(`select code, headline_metric, summary, challenge, outcomes, stack, related_service_slug from public.portfolio_items order by sort_order`);

    expect(portfolio.rows.length).toBeGreaterThanOrEqual(6);
    const portfolioJson = JSON.stringify(portfolio.rows);
    expect(portfolioJson).not.toMatch(/C\|EH/i);
    expect(portfolioJson).not.toMatch(/Certified Ethical Hacker/i);
    expect(portfolioJson).not.toContain('14 Critical/High');
    expect(portfolioJson).not.toContain('35+ Servers');
    expect(portfolioJson).not.toContain('94% Brute-Force');
    expect(portfolioJson).not.toContain('12,000+');
    expect(portfolioJson).not.toContain('< 6 Hours');

    for (const item of portfolio.rows) {
      if (item.related_service_slug) {
        expect(validSlugs.has(item.related_service_slug)).toBe(true);
      }
    }
  });
});
