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
    expect(serialized).toMatch(/C\|EH/i);
    expect(serialized).toMatch(/Certified Ethical Hacker/i);

    const codes = settings.credentials.map((c) => c.code);
    expect(codes).toContain('C|EH');
    expect(codes).toContain('CCEP');
    expect(codes).toContain('CNSP');
    expect(codes).toContain('CAP');

    const layek = settings.references_list.find((r) => r.name.includes('Abu Layek'));
    expect(layek?.email).toBe('abulayek@yahoo.com');
  });

  it('includes verified EC-Council C|EH vendor certification, FCD Founder & CEO experience, and updated education records in resume_items', async () => {
    const certs = await pg.db.query<{
      section: string;
      title: string;
      organization: string;
      verification_url: string | null;
      period: string | null;
    }>(`select section, title, organization, verification_url, period from public.resume_items`);
    const ceh = certs.rows.find(
      (r) => r.section === 'vendor_certification' && /Certified Ethical Hacker/i.test(r.title)
    );
    expect(ceh).toBeDefined();
    expect(ceh?.verification_url).toBe(
      'https://aspen.eccouncil.org/VerifyBadge?type=certification&a=DOHxj32aadzdBISA9fowYmydNqnnA7aGz7+N9haFaMg='
    );

    // EC-Council Learning course certificate remains under professional_certificate
    const ecCourse = certs.rows.find((r) => r.title === 'Mastering Ethical Hacking Tools');
    expect(ecCourse?.section).toBe('professional_certificate');

    const fcdExp = certs.rows.find(
      (r) => r.section === 'experience' && r.organization === 'Fast Cyber Defense'
    );
    expect(fcdExp?.title).toBe('Founder & CEO');

    const educationRows = certs.rows.filter((r) => r.section === 'education');
    expect(educationRows.find((r) => r.title === 'MSc in Computer Science & Engineering')?.period).toBe(
      '2022 · CGPA: 2.88/4.0'
    );
    expect(educationRows.find((r) => r.title === 'BSc in Computer Science & Engineering')?.period).toBe(
      '2020 · CGPA: 3.15/4.00'
    );
    expect(educationRows.find((r) => r.title === 'Higher Secondary Certificate')?.period).toBe(
      '2016 · GPA: 4.83/5.0'
    );
    expect(educationRows.find((r) => r.title === 'Secondary School Certificate')?.period).toBe(
      '2014 · GPA: 4.56/5.0'
    );
  });

  it('keeps portfolio_items free of fabricated legacy statistics and validates service slugs', async () => {
    const services = await pg.db.query<{ slug: string; title: string; tagline: string; description: string; highlights: string[] }>(
      `select slug, title, tagline, description, highlights from public.services`
    );

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
