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
import { FormCheckbox } from '@/components/ui/form-checkbox';
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
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl lg:max-w-3xl">
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
              className="space-y-4"
            >
              {editing ? <input type="hidden" name="id" value={editing.id} /> : null}

              <div className="grid gap-3.5 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="svc-title" className="text-sm font-medium">Service Title *</Label>
                  <Input
                    id="svc-title"
                    name="title"
                    required
                    defaultValue={editing?.title ?? ''}
                    placeholder="Cloud Security Posture Audit"
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="svc-slug" className="text-sm font-medium">URL Slug *</Label>
                  <Input
                    id="svc-slug"
                    name="slug"
                    required
                    defaultValue={editing?.slug ?? ''}
                    placeholder="cloud-security-posture-audit"
                    className="h-10 tabular-nums"
                  />
                </div>
              </div>

              <div className="grid gap-3.5 sm:grid-cols-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="svc-pillar" className="text-sm font-medium">Pillar *</Label>
                  <select
                    id="svc-pillar"
                    name="pillar"
                    aria-label="Service or study pillar"
                    defaultValue={editing?.pillar ?? 'cybersecurity'}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-base font-sans transition-colors hover:border-muted-foreground/45"
                  >
                    <option value="cybersecurity">cybersecurity</option>
                    <option value="development">development</option>
                    <option value="cloud_devops">cloud_devops</option>
                    <option value="ai_ml">ai_ml</option>
                    <option value="tech_support">tech_support</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="svc-starting-usd" className="text-sm font-medium">Starting USD</Label>
                  <Input
                    id="svc-starting-usd"
                    name="starting_price_usd"
                    type="number"
                    min="10"
                    required
                    defaultValue={editing ? Math.round((editing.startingPriceCents ?? 15000) / 100) : 250}
                    className="h-10 tabular-nums"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="svc-sort-order" className="text-sm font-medium">Sort Order</Label>
                  <Input
                    id="svc-sort-order"
                    name="sort_order"
                    type="number"
                    defaultValue={editing?.sortOrder ?? (services.length + 1) * 10}
                    className="h-10 tabular-nums"
                  />
                </div>
              </div>

              <div className="grid gap-3.5 sm:grid-cols-3">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="svc-tagline" className="text-sm font-medium">Short Tagline *</Label>
                  <Input
                    id="svc-tagline"
                    name="tagline"
                    required
                    defaultValue={editing?.tagline ?? ''}
                    className="h-10"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="svc-min-days" className="text-sm font-medium">Min Days</Label>
                    <Input
                      id="svc-min-days"
                      name="delivery_days_min"
                      type="number"
                      defaultValue={editing?.deliveryDaysMin ?? 3}
                      className="h-10 tabular-nums"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="svc-max-days" className="text-sm font-medium">Max Days</Label>
                    <Input
                      id="svc-max-days"
                      name="delivery_days_max"
                      type="number"
                      defaultValue={editing?.deliveryDaysMax ?? 14}
                      className="h-10 tabular-nums"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="svc-tools-tags" className="text-sm font-medium">Tools Tags (Comma separated)</Label>
                <Input
                  id="svc-tools-tags"
                  name="tools_tags"
                  defaultValue={(editing?.toolsTags ?? []).join(', ')}
                  placeholder="OWASP ASVS, Burp Suite Pro, Nuclei, Terraform"
                  className="h-10 tabular-nums"
                />
              </div>

              <div className="grid gap-3.5 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="svc-description" className="text-sm font-medium">Detailed Description</Label>
                  <Textarea
                    id="svc-description"
                    name="description"
                    rows={3}
                    defaultValue={editing?.description ?? ''}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="svc-highlights" className="text-sm font-medium">Highlights (One per line)</Label>
                  <Textarea
                    id="svc-highlights"
                    name="highlights"
                    rows={3}
                    defaultValue={(editing?.highlights ?? []).join('\n')}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex flex-wrap items-center gap-4 text-xs font-medium">
                  <label className="flex min-h-7 cursor-pointer items-center gap-1.5">
                    <FormCheckbox
                      name="requires_roe"
                      defaultChecked={editing?.requiresRoe ?? false}
                    />
                    Requires RoE
                  </label>
                  <label className="flex min-h-7 cursor-pointer items-center gap-1.5">
                    <FormCheckbox
                      name="is_featured"
                      defaultChecked={editing ? editing.isFeatured : true}
                    />
                    Featured
                  </label>
                  <label className="flex min-h-7 cursor-pointer items-center gap-1.5">
                    <FormCheckbox
                      name="is_public"
                      defaultChecked={editing ? editing.isPublic : true}
                    />
                    Public
                  </label>
                </div>
                <Button type="submit" size="sm" className="h-9 gap-1.5 rounded-full px-4">
                  <Save className="h-3.5 w-3.5" />
                  Save Service
                </Button>
              </div>
            </ActionFeedbackForm>

            {/* Package Tiers inside Drawer for existing DB services */}
            {editing && (
              <div className="space-y-4 border-t border-border pt-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Package Tiers ({editing.rawPackages.length})
                </h3>

                {editing.rawPackages.map((pkg) => (
                  <div
                    key={pkg.id}
                    className="space-y-3 rounded-xl border border-border/80 bg-muted/20 p-4"
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
                        className="h-7 px-2 text-xs text-destructive"
                      />
                    </div>

                    <ActionFeedbackForm
                      action={upsertServicePackageAction}
                      successMessage={`${pkg.tier_name} tier updated.`}
                      className="space-y-3"
                    >
                      <input type="hidden" name="id" value={pkg.id} />
                      <input type="hidden" name="service_id" value={editing.id} />
                      <input type="hidden" name="tier_name" value={pkg.tier_name} />

                      <div className="space-y-1.5">
                        <Label htmlFor={`pkg-name-${pkg.id}`} className="text-sm font-medium">Package Name</Label>
                        <Input
                          id={`pkg-name-${pkg.id}`}
                          name="package_name"
                          defaultValue={pkg.package_name}
                          required
                          className="h-10"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div className="space-y-1.5">
                          <Label htmlFor={`pkg-price-${pkg.id}`} className="text-sm font-medium">Price (USD)</Label>
                          <Input
                            id={`pkg-price-${pkg.id}`}
                            name="price_usd"
                            type="number"
                            defaultValue={Math.round(pkg.price_cents / 100)}
                            required
                            className="h-10 tabular-nums"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`pkg-dep-${pkg.id}`} className="text-sm font-medium">Deposit %</Label>
                          <Input
                            id={`pkg-dep-${pkg.id}`}
                            name="deposit_percent"
                            type="number"
                            min="0"
                            max="100"
                            defaultValue={pkg.deposit_percent ?? 50}
                            className="h-10 tabular-nums"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`pkg-days-${pkg.id}`} className="text-sm font-medium">Delivery Days</Label>
                          <Input
                            id={`pkg-days-${pkg.id}`}
                            name="delivery_days"
                            type="number"
                            defaultValue={pkg.delivery_days}
                            className="h-10 tabular-nums"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`pkg-rev-${pkg.id}`} className="text-sm font-medium">Revisions</Label>
                          <Input
                            id={`pkg-rev-${pkg.id}`}
                            name="revisions_included"
                            type="number"
                            defaultValue={pkg.revisions_included}
                            className="h-10 tabular-nums"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor={`pkg-sum-${pkg.id}`} className="text-sm font-medium">Summary</Label>
                        <Input id={`pkg-sum-${pkg.id}`} name="summary" defaultValue={pkg.summary} required className="h-10" />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor={`pkg-feat-${pkg.id}`} className="text-sm font-medium">Features (One per line)</Label>
                        <Textarea
                          id={`pkg-feat-${pkg.id}`}
                          name="features"
                          rows={3}
                          defaultValue={(pkg.features ?? []).join('\n')}
                        />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="flex items-center gap-4 text-xs font-medium">
                          <label className="flex min-h-7 cursor-pointer items-center gap-1.5">
                            <FormCheckbox
                              name="is_popular"
                              defaultChecked={pkg.is_popular}
                            />
                            Popular
                          </label>
                          <label className="flex min-h-7 cursor-pointer items-center gap-1.5">
                            <FormCheckbox
                              name="is_active"
                              defaultChecked={pkg.is_active}
                            />
                            Active
                          </label>
                        </div>
                        <Button type="submit" size="sm" variant="secondary" className="h-8 px-3.5 text-xs">
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
                  className="space-y-3.5 rounded-xl border border-dashed border-border/80 bg-muted/15 p-4 text-xs"
                >
                  <div className="text-sm font-semibold text-primary">+ Add or Replace Tier</div>
                  <input type="hidden" name="service_id" value={editing.id} />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="new-tier-name" className="text-sm font-medium">Tier *</Label>
                      <select
                        id="new-tier-name"
                        name="tier_name"
                        aria-label="Package tier name"
                        defaultValue="Standard"
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-base font-sans transition-colors hover:border-muted-foreground/45"
                      >
                        <option value="Starter">Starter</option>
                        <option value="Standard">Standard</option>
                        <option value="Enterprise">Enterprise</option>
                        <option value="Custom">Custom</option>
                      </select>
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="new-tier-pkg-name" className="text-sm font-medium">Package Name *</Label>
                      <Input
                        id="new-tier-pkg-name"
                        name="package_name"
                        aria-label="New package name"
                        placeholder="e.g. Full Production Audit"
                        required
                        className="h-10"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="new-tier-price" className="text-sm font-medium">Price (USD) *</Label>
                      <Input
                        id="new-tier-price"
                        name="price_usd"
                        aria-label="New tier price in USD"
                        type="number"
                        defaultValue={500}
                        required
                        placeholder="USD"
                        className="h-10 tabular-nums"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="new-tier-dep" className="text-sm font-medium">Deposit %</Label>
                      <Input
                        id="new-tier-dep"
                        name="deposit_percent"
                        aria-label="New tier deposit percent"
                        type="number"
                        defaultValue={50}
                        placeholder="Dep %"
                        className="h-10 tabular-nums"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="new-tier-days" className="text-sm font-medium">Delivery Days</Label>
                      <Input
                        id="new-tier-days"
                        name="delivery_days"
                        aria-label="New tier delivery days"
                        type="number"
                        defaultValue={7}
                        placeholder="Days"
                        className="h-10 tabular-nums"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="new-tier-rev" className="text-sm font-medium">Revisions</Label>
                      <Input
                        id="new-tier-rev"
                        name="revisions_included"
                        aria-label="New tier revisions included"
                        type="number"
                        defaultValue={2}
                        placeholder="Rev"
                        className="h-10 tabular-nums"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="new-tier-summary" className="text-sm font-medium">Short Summary *</Label>
                    <Input
                      id="new-tier-summary"
                      name="summary"
                      aria-label="New tier short summary"
                      placeholder="Concise scope summary shown on package card..."
                      required
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="new-tier-features" className="text-sm font-medium">Features (One per line)</Label>
                    <Textarea
                      id="new-tier-features"
                      name="features"
                      aria-label="New tier features"
                      rows={3}
                      placeholder="OWASP manual testing&#10;Executive PDF report&#10;1x retest verification"
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="flex items-center gap-4 text-xs font-medium">
                      <label className="flex min-h-7 cursor-pointer items-center gap-1.5">
                        <FormCheckbox name="is_popular" />
                        Popular
                      </label>
                      <label className="flex min-h-7 cursor-pointer items-center gap-1.5">
                        <FormCheckbox name="is_active" defaultChecked />
                        Active tier
                      </label>
                    </div>
                    <Button type="submit" size="sm" className="h-9 rounded-full px-4 text-xs">
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
            className="space-y-4 py-4"
          >
            {editing ? <input type="hidden" name="id" value={editing.dbId} /> : null}

            <div className="grid gap-3.5 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="cs-code" className="text-sm font-medium">Code *</Label>
                <Input
                  id="cs-code"
                  name="code"
                  required
                  defaultValue={editing?.code ?? `CS-${101 + studies.length}`}
                  className="h-10 tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cs-year" className="text-sm font-medium">Year *</Label>
                <Input id="cs-year" name="year" required defaultValue={editing?.year ?? '2026'} className="h-10 tabular-nums" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cs-pillar" className="text-sm font-medium">Pillar *</Label>
                <select
                  id="cs-pillar"
                  name="pillar"
                  aria-label="Case study pillar"
                  defaultValue={editing?.pillar ?? 'cybersecurity'}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-base font-sans transition-colors hover:border-muted-foreground/45"
                >
                  <option value="cybersecurity">cybersecurity</option>
                  <option value="development">development</option>
                  <option value="cloud_devops">cloud_devops</option>
                  <option value="ai_ml">ai_ml</option>
                  <option value="tech_support">tech_support</option>
                </select>
              </div>
            </div>

            <div className="grid gap-3.5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cs-title" className="text-sm font-medium">Title *</Label>
                <Input id="cs-title" name="title" required defaultValue={editing?.title ?? ''} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cs-slug" className="text-sm font-medium">URL Slug *</Label>
                <Input id="cs-slug" name="slug" required defaultValue={editing?.slug ?? ''} className="h-10 tabular-nums" />
              </div>
            </div>

            <div className="grid gap-3.5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cs-sector" className="text-sm font-medium">Client Sector *</Label>
                <Input id="cs-sector" name="client_sector" required defaultValue={editing?.clientSector ?? ''} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cs-metric" className="text-sm font-medium">Headline Metric *</Label>
                <Input id="cs-metric" name="headline_metric" required defaultValue={editing?.headlineMetric ?? ''} className="h-10 tabular-nums" />
              </div>
            </div>

            <div className="grid gap-3.5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cs-related-svc" className="text-sm font-medium">Related Service Slug *</Label>
                <Input
                  id="cs-related-svc"
                  name="related_service_slug"
                  required
                  defaultValue={editing?.relatedServiceSlug ?? 'vapt-penetration-testing'}
                  className="h-10 tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cs-external-url" className="text-sm font-medium">External Reference / Repo URL</Label>
                <Input
                  id="cs-external-url"
                  name="external_url"
                  defaultValue={editing?.externalUrl ?? ''}
                  placeholder="https://github.com/..."
                  className="h-10 tabular-nums"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cs-summary" className="text-sm font-medium">Executive Summary *</Label>
              <Textarea id="cs-summary" name="summary" rows={3} required defaultValue={editing?.summary ?? ''} />
            </div>

            <div className="grid gap-3.5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cs-challenge" className="text-sm font-medium">Challenge / Problem *</Label>
                <Textarea id="cs-challenge" name="challenge" rows={3} required defaultValue={editing?.challenge ?? ''} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cs-approach" className="text-sm font-medium">Approach (One step per line)</Label>
                <Textarea
                  id="cs-approach"
                  name="approach"
                  rows={3}
                  defaultValue={(editing?.approach ?? []).join('\n')}
                />
              </div>
            </div>

            <div className="grid gap-3.5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cs-outcomes" className="text-sm font-medium">Verified Outcomes (One per line)</Label>
                <Textarea
                  id="cs-outcomes"
                  name="outcomes"
                  rows={3}
                  defaultValue={(editing?.outcomes ?? []).join('\n')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cs-stack" className="text-sm font-medium">Tech Stack (Comma separated)</Label>
                <Textarea
                  id="cs-stack"
                  name="stack"
                  rows={3}
                  defaultValue={(editing?.stack ?? []).join(', ')}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex flex-wrap items-center gap-4 text-xs font-medium">
                <Input
                  name="sort_order"
                  aria-label="Case study sort order"
                  type="number"
                  defaultValue={editing?.sortOrder ?? (studies.length + 1) * 10}
                  className="h-9 w-24 tabular-nums"
                />
                <label className="flex min-h-7 cursor-pointer items-center gap-1.5">
                  <FormCheckbox
                    name="is_featured"
                    defaultChecked={editing ? editing.isFeatured : true}
                  />
                  Featured
                </label>
                <label className="flex min-h-7 cursor-pointer items-center gap-1.5">
                  <FormCheckbox
                    name="is_published"
                    defaultChecked={editing ? editing.isPublished : true}
                  />
                  Published
                </label>
              </div>
              <Button type="submit" size="sm" className="h-9 gap-1.5 rounded-full px-4">
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
                <TableHead className="hidden text-xs sm:table-cell">Section</TableHead>
                <TableHead className="text-xs">Title &amp; Organization</TableHead>
                <TableHead className="hidden text-xs md:table-cell">Period / Location</TableHead>
                <TableHead className="hidden text-xs sm:table-cell">Visible</TableHead>
                <TableHead className="text-right text-xs">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant="secondary" className="font-mono text-[10px] uppercase">
                      {item.section}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="mb-1 flex flex-wrap items-center gap-1 sm:hidden">
                      <Badge variant="secondary" className="font-mono text-[10px] uppercase">
                        {item.section}
                      </Badge>
                      <Badge variant={item.is_visible ? 'default' : 'outline'} className="font-mono text-[10px]">
                        {item.is_visible ? 'Visible' : 'Hidden'}
                      </Badge>
                    </div>
                    <div className="text-xs font-semibold sm:text-sm">{item.title}</div>
                    <div className="text-[11px] text-muted-foreground">{item.organization}</div>
                    <div className="mt-0.5 font-mono text-[10px] text-muted-foreground md:hidden">
                      {[item.period, item.location].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                    {[item.period, item.location].filter(Boolean).join(' · ') || '—'}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
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
            className="space-y-4 py-4"
          >
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}

            <div className="grid gap-3.5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cv-section" className="text-sm font-medium">Section *</Label>
                <select
                  id="cv-section"
                  name="section"
                  aria-label="Resume section category"
                  defaultValue={editing?.section ?? 'experience'}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-base font-sans transition-colors hover:border-muted-foreground/45"
                >
                  <option value="experience">Work Experience</option>
                  <option value="vendor_certification">Vendor Certification</option>
                  <option value="professional_certificate">Professional Certificate</option>
                  <option value="research">Peer-Reviewed Research</option>
                  <option value="leadership">Leadership &amp; Volunteering</option>
                  <option value="education">Academic Education</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cv-period" className="text-sm font-medium">Period / Year Label</Label>
                <Input
                  id="cv-period"
                  name="period"
                  defaultValue={editing?.period ?? ''}
                  placeholder="2025 – Present"
                  className="h-10 tabular-nums"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cv-title" className="text-sm font-medium">Title / Role / Degree / Paper *</Label>
              <Input id="cv-title" name="title" required defaultValue={editing?.title ?? ''} className="h-10" />
            </div>

            <div className="grid gap-3.5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cv-org" className="text-sm font-medium">Organization / Issuer</Label>
                <Input id="cv-org" name="organization" defaultValue={editing?.organization ?? ''} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cv-role-type" className="text-sm font-medium">Role Type</Label>
                <Input id="cv-role-type" name="role_type" defaultValue={editing?.role_type ?? ''} placeholder="Full-Time / Remote" className="h-10" />
              </div>
            </div>

            <div className="grid gap-3.5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cv-location" className="text-sm font-medium">Location</Label>
                <Input id="cv-location" name="location" defaultValue={editing?.location ?? ''} placeholder="Dhaka / Remote" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cv-badge" className="text-sm font-medium">Badge Label</Label>
                <Input id="cv-badge" name="badge_label" defaultValue={editing?.badge_label ?? ''} placeholder="Q1 Scopus / Verified" className="h-10 tabular-nums" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cv-verify-url" className="text-sm font-medium">Verification / DOI Link</Label>
              <Input id="cv-verify-url" name="verification_url" defaultValue={editing?.verification_url ?? ''} placeholder="https://..." className="h-10 tabular-nums" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cv-desc" className="text-sm font-medium">Summary / Abstract Description</Label>
              <Textarea id="cv-desc" name="description" rows={3} defaultValue={editing?.description ?? ''} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cv-highlights" className="text-sm font-medium">Highlights / Bullets (One per line)</Label>
              <Textarea
                id="cv-highlights"
                name="highlights"
                rows={3}
                defaultValue={(editing?.highlights ?? []).join('\n')}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-3 text-xs font-medium">
                <Input
                  name="sort_order"
                  aria-label="Resume entry sort order"
                  type="number"
                  defaultValue={editing?.sort_order ?? 10}
                  className="h-9 w-24 tabular-nums"
                />
                <label className="flex min-h-7 cursor-pointer items-center gap-1.5">
                  <FormCheckbox
                    name="is_visible"
                    defaultChecked={editing ? editing.is_visible : true}
                  />
                  Visible on /resume
                </label>
              </div>
              <Button type="submit" size="sm" className="h-9 gap-1.5 rounded-full px-4">
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
