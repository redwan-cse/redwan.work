import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TEMPLATE_CTA_LABELS } from '@/lib/email/outbox';

const ROOT = process.cwd();

function walkFiles(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', '.git', 'test-results', 'playwright-report'].includes(entry.name)) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(full, exts));
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Method 7: Dead-Code, Dependency Hygiene & Email-Template Parity Gate
 *
 * Prevents dependency bloat, dev-tool leaks into runtime `dependencies`,
 * unmapped transactional email templates, and duplicate SQL migration prefixes.
 */
describe('Method 7: Dead-Code, Dependency Hygiene & Email-Template Parity Gate', () => {
  it('[M7-DEPS-HYGIENE] keeps build/type/lint tools out of runtime dependencies and eliminates googleapis/resend bloat', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };

    const runtimeDeps = Object.keys(pkg.dependencies);
    const forbiddenInRuntime = [
      'googleapis',
      'resend',
      'eslint',
      'eslint-config-next',
      'typescript',
      'tailwindcss',
      '@tailwindcss/postcss',
      'tw-animate-css',
      '@types/node',
      '@types/react',
      '@types/react-dom',
    ];

    const leaked = forbiddenInRuntime.filter((dep) => runtimeDeps.includes(dep));
    expect(leaked, 'Forbidden/dev packages found in package.json dependencies').toEqual([]);

    // Every runtime dependency (other than framework peer core) must be imported in app/components/lib/hooks
    const sourceCorpus = walkFiles(ROOT, ['.ts', '.tsx', '.js', '.mjs', '.css'])
      .filter((f) => !f.includes(`${path.sep}tests${path.sep}`))
      .map((f) => fs.readFileSync(f, 'utf8'))
      .join('\n');

    const implicitFrameworkDeps = new Set(['next', 'react', 'react-dom']);
    const unusedDeps: string[] = [];
    for (const dep of runtimeDeps) {
      if (implicitFrameworkDeps.has(dep)) continue;
      const escaped = dep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(`['"\`]${escaped}(?:/[^'"\`]*)?['"\`]`);
      if (!rx.test(sourceCorpus)) {
        unusedDeps.push(dep);
      }
    }
    expect(unusedDeps, 'Unused runtime packages in package.json dependencies').toEqual([]);
  });

  it('[M7-EMAIL-TEMPLATE-PARITY] registers a domain-specific CTA label for 100% of enqueued email templates across TS and SQL', () => {
    const enqueued = new Set<string>();

    // Scan TypeScript callers in app/ and lib/
    for (const file of [
      ...walkFiles(path.join(ROOT, 'app'), ['.ts', '.tsx']),
      ...walkFiles(path.join(ROOT, 'lib'), ['.ts', '.tsx']),
    ]) {
      const src = fs.readFileSync(file, 'utf8');
      for (const m of src.matchAll(/\btemplate\s*:\s*['"]([a-z0-9_]+)['"]/g)) {
        enqueued.add(m[1]);
      }
    }

    // Scan SQL migrations inserting into public.email_outbox
    for (const file of walkFiles(path.join(ROOT, 'supabase', 'migrations'), ['.sql'])) {
      const src = fs.readFileSync(file, 'utf8');
      for (const m of src.matchAll(
        /insert\s+into\s+public\.email_outbox\s*\(([^)]+)\)\s*values\s*\(([\s\S]*?)\)\s*;/gi
      )) {
        const cols = m[1].split(',').map((c) => c.trim().toLowerCase());
        const idx = cols.indexOf('template');
        if (idx >= 0) {
          const vals = m[2].split(',');
          const lit = (vals[idx] ?? '').trim().match(/^'([a-z0-9_]+)'$/);
          if (lit) enqueued.add(lit[1]);
        }
      }
    }

    expect(enqueued.size).toBeGreaterThanOrEqual(20);
    const missing = [...enqueued].filter((tpl) => !TEMPLATE_CTA_LABELS[tpl]).sort();
    expect(
      missing,
      'Email templates enqueued in code/SQL but missing from TEMPLATE_CTA_LABELS in lib/email/outbox.ts'
    ).toEqual([]);
  });

  it('[M7-MIGRATION-PREFIX-UNIQUENESS] ensures zero duplicate numeric migration prefixes in supabase/migrations', () => {
    const migrations = fs
      .readdirSync(path.join(ROOT, 'supabase', 'migrations'))
      .filter((f) => f.endsWith('.sql'))
      .sort();
    expect(migrations.length).toBeGreaterThanOrEqual(30);

    const seen = new Map<string, string>();
    const duplicates: string[] = [];
    for (const file of migrations) {
      const prefix = file.split('_')[0];
      if (seen.has(prefix)) {
        duplicates.push(`${prefix}: ${seen.get(prefix)} vs ${file}`);
      }
      seen.set(prefix, file);
    }
    expect(duplicates, 'Duplicate migration prefixes detected').toEqual([]);
  });
});
