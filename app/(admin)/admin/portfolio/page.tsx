import { FileCheck2, Plus, Save, Trash2 } from 'lucide-react';
import { getPublicPortfolioItems } from '@/lib/cms/queries';
import {
  deletePortfolioItemAction,
  upsertPortfolioItemAction,
} from '@/lib/cms/actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export const dynamic = 'force-dynamic';

export default async function AdminPortfolioCmsPage() {
  const portfolioList = await getPublicPortfolioItems({ includeUnpublished: true });

  return (
    <div className="space-y-8">
      <div>
        <Badge variant="outline" className="mb-2 font-mono text-xs text-primary">
          DATABASE-DRIVEN PORTFOLIO CMS
        </Badge>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Portfolio Case Studies Management
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add, edit, or delete case studies (`CS-101`, `CS-102`, etc.). Changes reflect immediately on both the Home page (`/`) and Portfolio page (`/portfolio`).
        </p>
      </div>

      {/* Add New Case Study Card */}
      <Card className="border-primary/35 bg-card/90">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Plus className="h-5 w-5 text-primary" />
            Add New Portfolio Case Study
          </CardTitle>
          <CardDescription className="text-xs">
            Create a new verified case study with problem statement, engineering approach, measurable outcomes, and tech stack.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={upsertPortfolioItemAction} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-5">
              <div className="space-y-1">
                <Label className="text-xs">Code *</Label>
                <Input
                  name="code"
                  required
                  defaultValue={`CS-${101 + portfolioList.length}`}
                  className="h-9 font-mono text-xs"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Case Study Title *</Label>
                <Input
                  name="title"
                  required
                  placeholder="Zero-Trust Cloud Architecture & API Pentest"
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">URL Slug *</Label>
                <Input
                  name="slug"
                  required
                  placeholder="zero-trust-cloud-api-pentest"
                  className="h-9 font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Pillar *</Label>
                <select
                  name="pillar"
                  defaultValue="cybersecurity"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                >
                  <option value="cybersecurity">cybersecurity</option>
                  <option value="development">development</option>
                  <option value="cloud_devops">cloud_devops</option>
                  <option value="ai_ml">ai_ml</option>
                  <option value="tech_support">tech_support</option>
                </select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-xs">Year *</Label>
                <Input name="year" defaultValue="2026" required className="h-9 font-mono text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Client Sector *</Label>
                <Input
                  name="client_sector"
                  placeholder="FinTech / SaaS"
                  required
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Headline Metric *</Label>
                <Input
                  name="headline_metric"
                  placeholder="11 Critical Findings Patched • 0 Breaches"
                  required
                  className="h-9 font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Related Service Slug *</Label>
                <Input
                  name="related_service_slug"
                  defaultValue="vapt-penetration-testing"
                  required
                  className="h-9 font-mono text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Executive Summary *</Label>
              <Textarea
                name="summary"
                rows={2}
                required
                placeholder="Brief 1-2 sentence executive overview of the engagement..."
                className="text-xs"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Challenge / Problem Statement *</Label>
                <Textarea
                  name="challenge"
                  rows={3}
                  required
                  placeholder="What security or engineering bottleneck did the client face?"
                  className="text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Engineering Approach (One step per line) *</Label>
                <Textarea
                  name="approach"
                  rows={3}
                  required
                  placeholder="Step 1: Threat model & API mapping&#10;Step 2: Exploitation & remediation"
                  className="font-mono text-xs"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Verified Outcomes (One per line) *</Label>
                <Textarea
                  name="outcomes"
                  rows={3}
                  required
                  placeholder="Eliminated critical IDOR flaws&#10;Passed third-party compliance audit"
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tech Stack / Tools (Comma separated) *</Label>
                <Textarea
                  name="stack"
                  rows={3}
                  required
                  placeholder="OWASP ASVS, Burp Suite Pro, Next.js, PostgreSQL RLS"
                  className="font-mono text-xs"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Sort Order</Label>
                  <Input
                    name="sort_order"
                    type="number"
                    defaultValue={(portfolioList.length + 1) * 10}
                    className="h-8 w-20 font-mono text-xs"
                  />
                </div>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" name="is_featured" defaultChecked className="h-4 w-4 rounded" />
                  Featured on Home Page
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" name="is_published" defaultChecked className="h-4 w-4 rounded" />
                  Published (Visible on Public Site)
                </label>
              </div>
              <Button type="submit" size="sm" className="gap-1.5 rounded-full">
                <Plus className="h-4 w-4" />
                Add Case Study
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Existing Case Studies */}
      <div className="space-y-5">
        {portfolioList.map((study) => (
          <Card key={study.dbId} className="border-border/80 bg-card/90">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <FileCheck2 className="h-4 w-4 text-primary" />
                  <span className="font-mono text-sm font-bold text-primary">{study.code}</span>
                  <CardTitle className="text-base">{study.title}</CardTitle>
                  <Badge variant="secondary" className="font-mono text-xs">
                    {study.pillar}
                  </Badge>
                  <Badge variant={study.isPublished ? 'default' : 'outline'} className="font-mono text-[10px]">
                    {study.isPublished ? 'PUBLISHED' : 'HIDDEN'}
                  </Badge>
                </div>
                <form action={deletePortfolioItemAction}>
                  <input type="hidden" name="id" value={study.dbId} />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </Button>
                </form>
              </div>
            </CardHeader>

            <CardContent>
              <form action={upsertPortfolioItemAction} className="space-y-3">
                <input type="hidden" name="id" value={study.dbId} />
                <div className="grid gap-3 sm:grid-cols-5">
                  <div className="space-y-1">
                    <Label className="text-xs">Code</Label>
                    <Input name="code" defaultValue={study.code} required className="h-8 font-mono text-xs" />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs">Title</Label>
                    <Input name="title" defaultValue={study.title} required className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Slug</Label>
                    <Input name="slug" defaultValue={study.slug} required className="h-8 font-mono text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Pillar</Label>
                    <select
                      name="pillar"
                      defaultValue={study.pillar}
                      className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                    >
                      <option value="cybersecurity">cybersecurity</option>
                      <option value="development">development</option>
                      <option value="cloud_devops">cloud_devops</option>
                      <option value="ai_ml">ai_ml</option>
                      <option value="tech_support">tech_support</option>
                    </select>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="space-y-1">
                    <Label className="text-xs">Year</Label>
                    <Input name="year" defaultValue={study.year} required className="h-8 font-mono text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Client Sector</Label>
                    <Input name="client_sector" defaultValue={study.clientSector} required className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Headline Metric</Label>
                    <Input name="headline_metric" defaultValue={study.headlineMetric} required className="h-8 font-mono text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Related Service Slug</Label>
                    <Input name="related_service_slug" defaultValue={study.relatedServiceSlug} required className="h-8 font-mono text-xs" />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Executive Summary</Label>
                  <Textarea name="summary" rows={2} defaultValue={study.summary} required className="text-xs" />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Challenge</Label>
                    <Textarea name="challenge" rows={3} defaultValue={study.challenge} required className="text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Approach Steps (One per line)</Label>
                    <Textarea
                      name="approach"
                      rows={3}
                      defaultValue={(study.approach ?? []).join('\n')}
                      className="font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Outcomes (One per line)</Label>
                    <Textarea
                      name="outcomes"
                      rows={3}
                      defaultValue={(study.outcomes ?? []).join('\n')}
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Tech Stack (Comma separated)</Label>
                    <Textarea
                      name="stack"
                      rows={3}
                      defaultValue={(study.stack ?? []).join(', ')}
                      className="font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <div className="flex items-center gap-1.5">
                      <Label className="text-xs">Sort Order</Label>
                      <Input
                        name="sort_order"
                        type="number"
                        defaultValue={study.sortOrder}
                        className="h-7 w-16 font-mono text-xs"
                      />
                    </div>
                    <label className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        name="is_featured"
                        defaultChecked={study.isFeatured}
                        className="h-4 w-4 rounded"
                      />
                      Featured
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        name="is_published"
                        defaultChecked={study.isPublished}
                        className="h-4 w-4 rounded"
                      />
                      Published
                    </label>
                  </div>
                  <Button type="submit" size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
                    <Save className="h-3.5 w-3.5" />
                    Save Case Study Changes
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
