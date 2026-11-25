'use client';

import * as React from 'react';
import {
  Edit3,
  FileCheck2,
  Package,
  Plus,
  Save,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { ActionFeedbackForm } from '@/components/panel/action-feedback-form';
import { ConfirmActionButton } from '@/components/panel/confirm-action-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
  deletePortfolioItemAction,
  deleteResumeItemAction,
  deleteServiceAction,
  deleteServicePackageAction,
  upsertPortfolioItemAction,
  upsertResumeItemAction,
  upsertServiceAction,
  upsertServicePackageAction,
} from '@/lib/cms/actions';
import type { ResumeItemRecord } from '@/lib/cms/queries';

export interface AdminServiceStudioItem {
  id: string;
  slug: string;
  pillar: string;
  title: string;
  tagline: string;
  description: string;
  requiresRoe: boolean;
  startingPriceCents: number;
  deliveryDaysMin: number;
  deliveryDaysMax: number;
  highlights: string[];
  toolsTags?: string[];
  isPublic: boolean;
  isFeatured: boolean;
  sortOrder: number;
  rawPackages: Array<{
    id: string;
    tier_name: string;
    package_name: string;
    summary: string;
    price_cents: number;
    currency: string;
    deposit_percent: number;
    delivery_days: number;
    revisions_included: number;
    is_popular: boolean;
    is_active: boolean;
    features: string[];
  }>;
}

export interface AdminPortfolioStudioItem {
  dbId: string;
  code: string;
  title: string;
  slug: string;
  pillar: string;
  clientSector: string;
  year: string;
  headlineMetric: string;
  relatedServiceSlug: string;
  externalUrl?: string;
  summary: string;
  challenge: string;
  approach: string[];
  outcomes: string[];
  stack: string[];
  sortOrder: number;
  isFeatured: boolean;
  isPublished: boolean;
}

export function ServicesStudioTable({
  services,
}: {
  services: AdminServiceStudioItem[];
}) {
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const editing = React.useMemo(
    () => (editingId ? (services.find((s) => s.id === editingId) ?? null) : null),
    [editingId, services]
  );

  const openCreate = () => {
    setEditingId(null);
    setDrawerOpen(true);
  };
  const openEdit = (svc: AdminServiceStudioItem) => {
    setEditingId(svc.id);
    setDrawerOpen(true);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-4 w-4 text-primary" />
              Services &amp; Package Tiers ({services.length})
            </CardTitle>
            <CardDescription className="text-xs">
              Dense overview table. Click Edit to open the slide-over drawer with tools tags, deposit %, and Starter/Standard/Enterprise/Custom tiers.
            </CardDescription>
          </div>
          <Button size="sm" onClick={openCreate} className="gap-1.5 rounded-full">
            <Plus className="h-3.5 w-3.5" />
            New Service
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Service / Slug</TableHead>
                <TableHead className="text-xs">Pillar</TableHead>
                <TableHead className="text-right text-xs">From Price</TableHead>
                <TableHead className="text-xs">Tiers</TableHead>
                <TableHead className="text-xs">Visibility</TableHead>
                <TableHead className="text-right text-xs">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((svc) => (
                <TableRow key={svc.id}>
                  <TableCell>
                    <div className="font-semibold text-xs sm:text-sm">{svc.title}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">/{svc.slug}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-mono text-[10px]">
                      {svc.pillar}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs font-bold">
                    ${Math.round((svc.startingPriceCents ?? 0) / 100)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {svc.rawPackages.length} tier(s)
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge
                        variant={svc.isPublic ? 'default' : 'outline'}
                        className="font-mono text-[10px]"
                      >
                        {svc.isPublic ? 'PUBLIC' : 'HIDDEN'}
                      </Badge>
                      {svc.requiresRoe && (
                        <Badge
                          variant="outline"
                          className="border-amber-500/40 bg-amber-500/10 font-mono text-[10px] text-amber-800 dark:text-amber-300"
                        >
                          <ShieldAlert className="mr-1 h-2.5 w-2.5" />
                          RoE
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(svc)}
                        className="h-7 gap-1 text-xs"
                      >
                        <Edit3 className="h-3 w-3" />
                        Edit
                      </Button>
                      <ConfirmActionButton
                        action={deleteServiceAction}
                        hiddenFields={{ id: svc.id }}
                        triggerLabel="Delete"
                        confirmTitle={`Delete service "${svc.title}"?`}
                        confirmDescription="Deletes the service offering and hides it from the public catalog."
                        destructive
                        variant="ghost"
                        className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader className="border-b border-border pb-4 text-left">
            <SheetTitle>
              {editing ? `Edit Service: ${editing.title}` : 'Create New Service Offering'}
            </SheetTitle>
            <SheetDescription className="text-xs">
              Updates sync immediately across public services catalog, /services/[slug], and Client Order Store.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6 py-4">
            <ActionFeedbackForm
              key={editing?.id ?? 'new-service'}
              action={upsertServiceAction}
              successMessage="Service saved to catalog."
              className="space-y-3.5"
            >
              {editing ? <input type="hidden" name="id" value={editing.id} /> : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="svc-title" className="text-xs">Service Title *</Label>
                  <Input
                    id="svc-title"
                    name="title"
                    required
                    defaultValue={editing?.title ?? ''}
                    placeholder="Cloud Security Posture Audit"
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="svc-slug" className="text-xs">URL Slug *</Label>
                  <Input
                    id="svc-slug"
                    name="slug"
                    required
                    defaultValue={editing?.slug ?? ''}
                    placeholder="cloud-security-posture-audit"
                    className="h-9 font-mono text-xs"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="svc-pillar" className="text-xs">Pillar *</Label>
                  <select
                    id="svc-pillar"
                    name="pillar"
                    aria-label="Service or study pillar"
                    defaultValue={editing?.pillar ?? 'cybersecurity'}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs"
                  >
                    <option value="cybersecurity">cybersecurity</option>
                    <option value="development">development</option>
                    <option value="cloud_devops">cloud_devops</option>
                    <option value="ai_ml">ai_ml</option>
                    <option value="tech_support">tech_support</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="svc-starting-usd" className="text-xs">Starting USD</Label>
                  <Input
                    id="svc-starting-usd"
                    name="starting_price_usd"
                    type="number"
                    min="10"
                    required
                    defaultValue={editing ? Math.round((editing.startingPriceCents ?? 15000) / 100) : 250}
                    className="h-9 font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="svc-sort-order" className="text-xs">Sort Order</Label>
                  <Input
                    id="svc-sort-order"
                    name="sort_order"
                    type="number"
                    defaultValue={editing?.sortOrder ?? (services.length + 1) * 10}
                    className="h-9 font-mono text-xs"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="svc-tagline" className="text-xs">Short Tagline *</Label>
                  <Input
                    id="svc-tagline"
                    name="tagline"
                    required
                    defaultValue={editing?.tagline ?? ''}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="space-y-1">
                    <Label htmlFor="svc-min-days" className="text-xs">Min Days</Label>
                    <Input
                      id="svc-min-days"
                      name="delivery_days_min"
                      type="number"
                      defaultValue={editing?.deliveryDaysMin ?? 3}
                      className="h-9 font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="svc-max-days" className="text-xs">Max Days</Label>
                    <Input
                      id="svc-max-days"
                      name="delivery_days_max"
                      type="number"
                      defaultValue={editing?.deliveryDaysMax ?? 14}
                      className="h-9 font-mono text-xs"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="svc-tools-tags" className="text-xs">Tools Tags (Comma separated)</Label>
                <Input
                  id="svc-tools-tags"
                  name="tools_tags"
                  defaultValue={(editing?.toolsTags ?? []).join(', ')}
                  placeholder="OWASP ASVS, Burp Suite Pro, Nuclei, Terraform"
                  className="h-9 font-mono text-xs"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="svc-description" className="text-xs">Detailed Description</Label>
                  <Textarea
                    id="svc-description"
                    name="description"
                    rows={3}
                    defaultValue={editing?.description ?? ''}
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="svc-highlights" className="text-xs">Highlights (One per line)</Label>
                  <Textarea
                    id="svc-highlights"
                    name="highlights"
                    rows={3}
                    defaultValue={(editing?.highlights ?? []).join('\n')}
                    className="font-mono text-xs"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex flex-wrap items-center gap-4 text-xs">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      name="requires_roe"
                      defaultChecked={editing?.requiresRoe ?? false}
                      className="h-6 w-6 rounded accent-primary"
                    />
                    Requires RoE
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      name="is_featured"
                      defaultChecked={editing ? editing.isFeatured : true}
                      className="h-6 w-6 rounded accent-primary"
                    />
                    Featured
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      name="is_public"
                      defaultChecked={editing ? editing.isPublic : true}
                      className="h-6 w-6 rounded accent-primary"
                    />
                    Public
                  </label>
                </div>
                <Button type="submit" size="sm" className="gap-1.5 rounded-full">
                  <Save className="h-3.5 w-3.5" />
                  Save Service
                </Button>
              </div>
            </ActionFeedbackForm>

            {/* Package Tiers inside Drawer for existing DB services */}
            {editing && (
              <div className="space-y-4 border-t border-border pt-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Package Tiers ({editing.rawPackages.length})
                </h3>

                {editing.rawPackages.map((pkg) => (
                  <div
                    key={pkg.id}
                    className="space-y-2.5 rounded-xl border border-border/80 bg-muted/20 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="font-mono text-[10px] uppercase text-primary">
                        {pkg.tier_name}
                      </Badge>
                      <ConfirmActionButton
                        action={deleteServicePackageAction}
                        hiddenFields={{ id: pkg.id }}
                        triggerLabel="Remove Tier"
                        confirmTitle={`Delete ${pkg.tier_name} tier?`}
                        confirmDescription="Deletes this package tier from the service store."
                        destructive
                        variant="ghost"
                        className="h-7 px-2 text-[11px] text-destructive"
                      />
                    </div>

                    <ActionFeedbackForm
                      action={upsertServicePackageAction}
                      successMessage={`${pkg.tier_name} tier updated.`}
                      className="space-y-2.5"
                    >
                      <input type="hidden" name="id" value={pkg.id} />
                      <input type="hidden" name="service_id" value={editing.id} />
                      <input type="hidden" name="tier_name" value={pkg.tier_name} />

                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label htmlFor={`pkg-name-${pkg.id}`} className="text-[11px]">Package Name</Label>
                          <Input
                            id={`pkg-name-${pkg.id}`}
                            name="package_name"
                            defaultValue={pkg.package_name}
                            required
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <div className="space-y-1">
                            <Label htmlFor={`pkg-price-${pkg.id}`} className="text-[11px]">Price (USD)</Label>
                            <Input
                              id={`pkg-price-${pkg.id}`}
                              name="price_usd"
                              type="number"
                              defaultValue={Math.round(pkg.price_cents / 100)}
                              required
                              className="h-8 font-mono text-xs"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`pkg-dep-${pkg.id}`} className="text-[11px]">Deposit %</Label>
                            <Input
                              id={`pkg-dep-${pkg.id}`}
                              name="deposit_percent"
                              type="number"
                              min="0"
                              max="100"
                              defaultValue={pkg.deposit_percent ?? 50}
                              className="h-8 font-mono text-xs"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label htmlFor={`pkg-days-${pkg.id}`} className="text-[11px]">Delivery Days</Label>
                          <Input
                            id={`pkg-days-${pkg.id}`}
                            name="delivery_days"
                            type="number"
                            defaultValue={pkg.delivery_days}
                            className="h-8 font-mono text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`pkg-rev-${pkg.id}`} className="text-[11px]">Revisions Included</Label>
                          <Input
                            id={`pkg-rev-${pkg.id}`}
                            name="revisions_included"
                            type="number"
                            defaultValue={pkg.revisions_included}
                            className="h-8 font-mono text-xs"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor={`pkg-sum-${pkg.id}`} className="text-[11px]">Summary</Label>
                        <Input id={`pkg-sum-${pkg.id}`} name="summary" defaultValue={pkg.summary} required className="h-8 text-xs" />
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor={`pkg-feat-${pkg.id}`} className="text-[11px]">Features (One per line)</Label>
                        <Textarea
                          id={`pkg-feat-${pkg.id}`}
                          name="features"
                          rows={2}
                          defaultValue={(pkg.features ?? []).join('\n')}
                          className="font-mono text-[11px]"
                        />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="flex items-center gap-3 text-[11px]">
                          <label className="flex min-h-7 cursor-pointer items-center gap-1.5">
                            <input
                              type="checkbox"
                              name="is_popular"
                              defaultChecked={pkg.is_popular}
                              className="h-6 w-6 rounded accent-primary"
                            />
                            Popular
                          </label>
                          <label className="flex min-h-7 cursor-pointer items-center gap-1.5">
                            <input
                              type="checkbox"
                              name="is_active"
                              defaultChecked={pkg.is_active}
                              className="h-6 w-6 rounded accent-primary"
                            />
                            Active
                          </label>
                        </div>
                        <Button type="submit" size="sm" variant="secondary" className="h-7 text-[11px]">
                          Update Tier
                        </Button>
                      </div>
                    </ActionFeedbackForm>
                  </div>
                ))}

                {/* Add / Upsert a Tier */}
                <ActionFeedbackForm
                  action={upsertServicePackageAction}
                  successMessage="Package tier saved."
                  resetOnSuccess
                  className="space-y-2.5 rounded-xl border border-dashed border-border/80 bg-muted/15 p-3 text-xs"
                >
                  <div className="font-semibold text-primary">+ Add or Replace Tier</div>
                  <input type="hidden" name="service_id" value={editing.id} />
                  <div className="grid gap-2 sm:grid-cols-3">
                    <select
                      name="tier_name"
                      aria-label="Package tier name"
                      defaultValue="Standard"
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    >
                      <option value="Starter">Starter</option>
                      <option value="Standard">Standard</option>
                      <option value="Enterprise">Enterprise</option>
                      <option value="Custom">Custom</option>
                    </select>
                    <Input name="package_name" aria-label="New package name" placeholder="Package Name *" required className="h-8 sm:col-span-2 text-xs" />
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Input name="price_usd" aria-label="New tier price in USD" type="number" defaultValue={500} required placeholder="USD" className="h-8 font-mono text-xs" />
                    <Input name="deposit_percent" aria-label="New tier deposit percent" type="number" defaultValue={50} placeholder="Dep %" className="h-8 font-mono text-xs" />
                    <Input name="delivery_days" aria-label="New tier delivery days" type="number" defaultValue={7} placeholder="Days" className="h-8 font-mono text-xs" />
                    <Input name="revisions_included" aria-label="New tier revisions included" type="number" defaultValue={2} placeholder="Rev" className="h-8 font-mono text-xs" />
                  </div>
                  <Input name="summary" aria-label="New tier short summary" placeholder="Short tier summary *" required className="h-8 text-xs" />
                  <Textarea name="features" aria-label="New tier features" rows={2} placeholder="Features (one per line)" className="font-mono text-xs" />
                  <div className="flex items-center justify-between">
                    <label className="flex min-h-7 cursor-pointer items-center gap-1.5 text-xs">
                      <input type="checkbox" name="is_active" defaultChecked className="h-6 w-6 rounded accent-primary" />
                      Active tier
                    </label>
                    <Button type="submit" size="sm" className="h-8 rounded-full text-xs">
                      Save Package Tier
                    </Button>
                  </div>
                </ActionFeedbackForm>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function PortfolioStudioTable({
  studies,
}: {
  studies: AdminPortfolioStudioItem[];
}) {
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const editing = React.useMemo(
    () => (editingId ? (studies.find((s) => s.dbId === editingId) ?? null) : null),
    [editingId, studies]
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileCheck2 className="h-4 w-4 text-primary" />
              Portfolio Case Studies ({studies.length})
            </CardTitle>
            <CardDescription className="text-xs">
              Click Edit on any case study to manage problem statement, outcomes, stack tags, and external reference URL in the drawer.
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setEditingId(null);
              setDrawerOpen(true);
            }}
            className="gap-1.5 rounded-full"
          >
            <Plus className="h-3.5 w-3.5" />
            New Case Study
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Code / Title</TableHead>
                <TableHead className="text-xs">Pillar</TableHead>
                <TableHead className="text-xs">Headline Metric</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-right text-xs">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {studies.map((study) => (
                <TableRow key={study.dbId}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-primary">{study.code}</span>
                      <span className="font-semibold text-xs sm:text-sm">{study.title}</span>
                    </div>
                    <div className="font-mono text-[11px] text-muted-foreground">/{study.slug}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-mono text-[10px]">
                      {study.pillar}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{study.headlineMetric}</TableCell>
                  <TableCell>
                    <Badge
                      variant={study.isPublished ? 'default' : 'outline'}
                      className="font-mono text-[10px]"
                    >
                      {study.isPublished ? 'PUBLISHED' : 'HIDDEN'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingId(study.dbId);
                          setDrawerOpen(true);
                        }}
                        className="h-7 gap-1 text-xs"
                      >
                        <Edit3 className="h-3 w-3" />
                        Edit
                      </Button>
                      <ConfirmActionButton
                        action={deletePortfolioItemAction}
                        hiddenFields={{ id: study.dbId }}
                        triggerLabel="Delete"
                        confirmTitle={`Delete case study "${study.code}"?`}
                        confirmDescription="Permanently removes this case study from the portfolio database."
                        destructive
                        variant="ghost"
                        className="h-7 px-2 text-xs text-destructive"
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader className="border-b border-border pb-4 text-left">
            <SheetTitle>
              {editing ? `Edit Case Study: ${editing.code}` : 'Add New Portfolio Case Study'}
            </SheetTitle>
            <SheetDescription className="text-xs">
              Syncs across /, /portfolio, and /portfolio/[slug].
            </SheetDescription>
          </SheetHeader>

          <ActionFeedbackForm
            key={editing?.dbId ?? 'new-portfolio'}
            action={upsertPortfolioItemAction}
            successMessage="Portfolio case study saved."
            className="space-y-3.5 py-4"
          >
            {editing ? <input type="hidden" name="id" value={editing.dbId} /> : null}

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="cs-code" className="text-xs">Code *</Label>
                <Input
                  id="cs-code"
                  name="code"
                  required
                  defaultValue={editing?.code ?? `CS-${101 + studies.length}`}
                  className="h-9 font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cs-year" className="text-xs">Year *</Label>
                <Input id="cs-year" name="year" required defaultValue={editing?.year ?? '2026'} className="h-9 font-mono text-xs" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cs-pillar" className="text-xs">Pillar *</Label>
                <select
                  id="cs-pillar"
                  name="pillar"
                  aria-label="Case study pillar"
                  defaultValue={editing?.pillar ?? 'cybersecurity'}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs"
                >
                  <option value="cybersecurity">cybersecurity</option>
                  <option value="development">development</option>
                  <option value="cloud_devops">cloud_devops</option>
                  <option value="ai_ml">ai_ml</option>
                  <option value="tech_support">tech_support</option>
                </select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="cs-title" className="text-xs">Title *</Label>
                <Input id="cs-title" name="title" required defaultValue={editing?.title ?? ''} className="h-9 text-xs" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cs-slug" className="text-xs">URL Slug *</Label>
                <Input id="cs-slug" name="slug" required defaultValue={editing?.slug ?? ''} className="h-9 font-mono text-xs" />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="cs-sector" className="text-xs">Client Sector *</Label>
                <Input id="cs-sector" name="client_sector" required defaultValue={editing?.clientSector ?? ''} className="h-9 text-xs" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cs-metric" className="text-xs">Headline Metric *</Label>
                <Input id="cs-metric" name="headline_metric" required defaultValue={editing?.headlineMetric ?? ''} className="h-9 font-mono text-xs" />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="cs-related-svc" className="text-xs">Related Service Slug *</Label>
                <Input
                  id="cs-related-svc"
                  name="related_service_slug"
                  required
                  defaultValue={editing?.relatedServiceSlug ?? 'vapt-penetration-testing'}
                  className="h-9 font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cs-external-url" className="text-xs">External Reference / Repo URL</Label>
                <Input
                  id="cs-external-url"
                  name="external_url"
                  defaultValue={editing?.externalUrl ?? ''}
                  placeholder="https://github.com/..."
                  className="h-9 font-mono text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="cs-summary" className="text-xs">Executive Summary *</Label>
              <Textarea id="cs-summary" name="summary" rows={2} required defaultValue={editing?.summary ?? ''} className="text-xs" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="cs-challenge" className="text-xs">Challenge / Problem *</Label>
                <Textarea id="cs-challenge" name="challenge" rows={3} required defaultValue={editing?.challenge ?? ''} className="text-xs" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cs-approach" className="text-xs">Approach (One step per line)</Label>
                <Textarea
                  id="cs-approach"
                  name="approach"
                  rows={3}
                  defaultValue={(editing?.approach ?? []).join('\n')}
                  className="font-mono text-xs"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="cs-outcomes" className="text-xs">Verified Outcomes (One per line)</Label>
                <Textarea
                  id="cs-outcomes"
                  name="outcomes"
                  rows={3}
                  defaultValue={(editing?.outcomes ?? []).join('\n')}
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cs-stack" className="text-xs">Tech Stack (Comma separated)</Label>
                <Textarea
                  id="cs-stack"
                  name="stack"
                  rows={3}
                  defaultValue={(editing?.stack ?? []).join(', ')}
                  className="font-mono text-xs"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <Input
                  name="sort_order"
                  aria-label="Case study sort order"
                  type="number"
                  defaultValue={editing?.sortOrder ?? (studies.length + 1) * 10}
                  className="h-8 w-20 font-mono text-xs"
                />
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    name="is_featured"
                    defaultChecked={editing ? editing.isFeatured : true}
                    className="h-6 w-6 rounded accent-primary"
                  />
                  Featured
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    name="is_published"
                    defaultChecked={editing ? editing.isPublished : true}
                    className="h-6 w-6 rounded accent-primary"
                  />
                  Published
                </label>
              </div>
              <Button type="submit" size="sm" className="gap-1.5 rounded-full">
                <Save className="h-3.5 w-3.5" />
                Save Case Study
              </Button>
            </div>
          </ActionFeedbackForm>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function ResumeItemsStudioTable({ items }: { items: ResumeItemRecord[] }) {
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const editing = React.useMemo(
    () => (editingId ? (items.find((i) => i.id === editingId) ?? null) : null),
    [editingId, items]
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
          <div>
            <CardTitle className="text-base">CV Timeline, Credentials &amp; Research ({items.length})</CardTitle>
            <CardDescription className="text-xs">
              Click Edit to update entry description, location, period, verification DOI/URL, or visibility inside a clean drawer.
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setEditingId(null);
              setDrawerOpen(true);
            }}
            className="gap-1.5 rounded-full"
          >
            <Plus className="h-3.5 w-3.5" />
            Add CV Entry
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Section</TableHead>
                <TableHead className="text-xs">Title &amp; Organization</TableHead>
                <TableHead className="text-xs">Period / Location</TableHead>
                <TableHead className="text-xs">Visible</TableHead>
                <TableHead className="text-right text-xs">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Badge variant="secondary" className="font-mono text-[10px] uppercase">
                      {item.section}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs font-semibold sm:text-sm">{item.title}</div>
                    <div className="text-[11px] text-muted-foreground">{item.organization}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {[item.period, item.location].filter(Boolean).join(' · ') || '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.is_visible ? 'default' : 'outline'} className="font-mono text-[10px]">
                      {item.is_visible ? 'Visible' : 'Hidden'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingId(item.id);
                          setDrawerOpen(true);
                        }}
                        className="h-7 gap-1 text-xs"
                      >
                        <Edit3 className="h-3 w-3" />
                        Edit
                      </Button>
                      <ConfirmActionButton
                        action={deleteResumeItemAction}
                        hiddenFields={{ id: item.id }}
                        triggerLabel="Delete"
                        confirmTitle={`Delete CV entry "${item.title}"?`}
                        confirmDescription="Removes this resume entry from /resume."
                        destructive
                        variant="ghost"
                        className="h-7 px-2 text-xs text-destructive"
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader className="border-b border-border pb-4 text-left">
            <SheetTitle>
              {editing ? `Edit Entry: ${editing.title}` : 'Add New Resume Entry'}
            </SheetTitle>
            <SheetDescription className="text-xs">
              Syncs immediately on the public /resume page.
            </SheetDescription>
          </SheetHeader>

          <ActionFeedbackForm
            key={editing?.id ?? 'new-resume'}
            action={upsertResumeItemAction}
            successMessage="Resume entry saved."
            className="space-y-3.5 py-4"
          >
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="cv-section" className="text-xs">Section *</Label>
                <select
                  id="cv-section"
                  name="section"
                  aria-label="Resume section category"
                  defaultValue={editing?.section ?? 'experience'}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs"
                >
                  <option value="experience">Work Experience</option>
                  <option value="vendor_certification">Vendor Certification</option>
                  <option value="professional_certificate">Professional Certificate</option>
                  <option value="research">Peer-Reviewed Research</option>
                  <option value="leadership">Leadership &amp; Volunteering</option>
                  <option value="education">Academic Education</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="cv-period" className="text-xs">Period / Year Label</Label>
                <Input
                  id="cv-period"
                  name="period"
                  defaultValue={editing?.period ?? ''}
                  placeholder="2025 – Present"
                  className="h-9 font-mono text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="cv-title" className="text-xs">Title / Role / Degree / Paper *</Label>
              <Input id="cv-title" name="title" required defaultValue={editing?.title ?? ''} className="h-9 text-xs" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="cv-org" className="text-xs">Organization / Issuer</Label>
                <Input id="cv-org" name="organization" defaultValue={editing?.organization ?? ''} className="h-9 text-xs" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cv-role-type" className="text-xs">Role Type</Label>
                <Input id="cv-role-type" name="role_type" defaultValue={editing?.role_type ?? ''} placeholder="Full-Time / Remote" className="h-9 text-xs" />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="cv-location" className="text-xs">Location</Label>
                <Input id="cv-location" name="location" defaultValue={editing?.location ?? ''} placeholder="Dhaka / Remote" className="h-9 text-xs" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cv-badge" className="text-xs">Badge Label</Label>
                <Input id="cv-badge" name="badge_label" defaultValue={editing?.badge_label ?? ''} placeholder="Q1 Scopus / Verified" className="h-9 font-mono text-xs" />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="cv-verify-url" className="text-xs">Verification / DOI Link</Label>
              <Input id="cv-verify-url" name="verification_url" defaultValue={editing?.verification_url ?? ''} placeholder="https://..." className="h-9 font-mono text-xs" />
            </div>

            <div className="space-y-1">
              <Label htmlFor="cv-desc" className="text-xs">Summary / Abstract Description</Label>
              <Textarea id="cv-desc" name="description" rows={2} defaultValue={editing?.description ?? ''} className="text-xs" />
            </div>

            <div className="space-y-1">
              <Label htmlFor="cv-highlights" className="text-xs">Highlights / Bullets (One per line)</Label>
              <Textarea
                id="cv-highlights"
                name="highlights"
                rows={3}
                defaultValue={(editing?.highlights ?? []).join('\n')}
                className="font-mono text-xs"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-3 text-xs">
                <Input
                  name="sort_order"
                  aria-label="Resume entry sort order"
                  type="number"
                  defaultValue={editing?.sort_order ?? 10}
                  className="h-8 w-20 font-mono text-xs"
                />
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    name="is_visible"
                    defaultChecked={editing ? editing.is_visible : true}
                    className="h-6 w-6 rounded accent-primary"
                  />
                  Visible on /resume
                </label>
              </div>
              <Button type="submit" size="sm" className="gap-1.5 rounded-full">
                <Save className="h-3.5 w-3.5" />
                Save Entry
              </Button>
            </div>
          </ActionFeedbackForm>
        </SheetContent>
      </Sheet>
    </div>
  );
}
