import { Package, Plus, Save, ShieldAlert, Trash2 } from 'lucide-react';
import { getPublicServicesCatalog } from '@/lib/cms/queries';
import {
  deleteServiceAction,
  deleteServicePackageAction,
  upsertServiceAction,
  upsertServicePackageAction,
} from '@/lib/cms/actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export const dynamic = 'force-dynamic';

export default async function AdminServicesCmsPage() {
  const serviceList = await getPublicServicesCatalog({ includeHidden: true });

  return (
    <div className="space-y-8">
      <div>
        <Badge variant="outline" className="mb-2 font-mono text-xs text-primary">
          DATABASE-DRIVEN SERVICE CATALOG CMS
        </Badge>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Services &amp; Package Tiers Management
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add, edit, or delete services and package tiers (`Starter`, `Standard`, `Enterprise`). Changes synchronize immediately across `/`, `/services`, `/contact`, and the Client Portal Order Store.
        </p>
      </div>

      {/* Add New Service Card */}
      <Card className="border-primary/35 bg-card/90">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Plus className="h-5 w-5 text-primary" />
            Add New Service Offering
          </CardTitle>
          <CardDescription className="text-xs">
            Create a new service under any of the 5 pillars. You can add Starter, Standard, and Enterprise tiers once created.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={upsertServiceAction} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Service Title *</Label>
                <Input
                  name="title"
                  required
                  placeholder="e.g. Cloud Security Posture Audit"
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">URL Slug *</Label>
                <Input
                  name="slug"
                  required
                  placeholder="cloud-security-posture-audit"
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
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Short Tagline *</Label>
                <Input
                  name="tagline"
                  required
                  placeholder="Comprehensive AWS/GCP/Cloudflare security posture assessment"
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Starting Price (USD) *</Label>
                <Input
                  name="starting_price_usd"
                  type="number"
                  min={10}
                  defaultValue={250}
                  required
                  className="h-9 font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Sort Order</Label>
                <Input
                  name="sort_order"
                  type="number"
                  defaultValue={(serviceList.length + 1) * 10}
                  className="h-9 font-mono text-xs"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Detailed Description</Label>
                <Textarea
                  name="description"
                  rows={3}
                  placeholder="Detailed overview of methodology, tools, and business value..."
                  className="text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Key Highlights / Deliverables (One per line)</Label>
                <Textarea
                  name="highlights"
                  rows={3}
                  placeholder="Executive & Technical Report&#10;Remediation Patch Verification&#10;Signed Certificate"
                  className="font-mono text-xs"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" name="requires_roe" className="h-4 w-4 rounded" />
                  Requires RoE Signature
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" name="is_featured" defaultChecked className="h-4 w-4 rounded" />
                  Featured
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" name="is_public" defaultChecked className="h-4 w-4 rounded" />
                  Public (Visible on Site)
                </label>
              </div>
              <Button type="submit" size="sm" className="gap-1.5 rounded-full">
                <Plus className="h-4 w-4" />
                Create Service
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Existing Services & Their Package Tiers */}
      <div className="space-y-6">
        {serviceList.map((service) => (
          <Card key={service.id} className="border-border/80 bg-card/90">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Package className="h-4 w-4 text-primary" />
                  <CardTitle className="text-lg">{service.title}</CardTitle>
                  <Badge variant="secondary" className="font-mono text-xs">
                    {service.pillar}
                  </Badge>
                  <Badge variant={service.isPublic ? 'default' : 'outline'} className="font-mono text-[10px]">
                    {service.isPublic ? 'PUBLIC' : 'HIDDEN'}
                  </Badge>
                  {service.requiresRoe && (
                    <Badge
                      variant="outline"
                      className="border-amber-500/40 bg-amber-500/10 font-mono text-[10px] text-amber-500"
                    >
                      <ShieldAlert className="mr-1 h-3 w-3" />
                      RoE Required
                    </Badge>
                  )}
                </div>
                <form action={deleteServiceAction}>
                  <input type="hidden" name="id" value={service.id} />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete Service
                  </Button>
                </form>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Edit Service Form */}
              <form
                action={upsertServiceAction}
                className="space-y-3 rounded-xl border border-border/70 bg-background/50 p-4"
              >
                <input type="hidden" name="id" value={service.id} />
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs">Title</Label>
                    <Input name="title" defaultValue={service.title} required className="h-9 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Slug</Label>
                    <Input name="slug" defaultValue={service.slug} required className="h-9 font-mono text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Pillar</Label>
                    <select
                      name="pillar"
                      defaultValue={service.pillar}
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

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs">Tagline</Label>
                    <Input name="tagline" defaultValue={service.tagline} required className="h-9 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Starting USD</Label>
                    <Input
                      name="starting_price_usd"
                      type="number"
                      defaultValue={Math.round((service.startingPriceCents ?? 15000) / 100)}
                      className="h-9 font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Min/Max Days</Label>
                    <div className="flex gap-1.5">
                      <Input
                        name="delivery_days_min"
                        type="number"
                        defaultValue={service.deliveryDaysMin ?? 3}
                        className="h-9 font-mono text-xs"
                      />
                      <Input
                        name="delivery_days_max"
                        type="number"
                        defaultValue={service.deliveryDaysMax ?? 14}
                        className="h-9 font-mono text-xs"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Sort Order</Label>
                    <Input
                      name="sort_order"
                      type="number"
                      defaultValue={service.sortOrder}
                      className="h-9 font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Detailed Description</Label>
                    <Textarea
                      name="description"
                      rows={2}
                      defaultValue={service.description ?? ''}
                      className="text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Highlights (One per line)</Label>
                    <Textarea
                      name="highlights"
                      rows={2}
                      defaultValue={(service.highlights ?? []).join('\n')}
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
                        defaultChecked={service.requiresRoe}
                        className="h-4 w-4 rounded"
                      />
                      Requires RoE
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        name="is_featured"
                        defaultChecked={service.isFeatured}
                        className="h-4 w-4 rounded"
                      />
                      Featured
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        name="is_public"
                        defaultChecked={service.isPublic}
                        className="h-4 w-4 rounded"
                      />
                      Public
                    </label>
                  </div>
                  <Button type="submit" size="sm" variant="outline" className="h-9 gap-1.5 text-xs">
                    <Save className="h-3.5 w-3.5" />
                    Save Service Changes
                  </Button>
                </div>
              </form>

              {/* Package Tiers for this Service */}
              <div className="space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Package Tiers ({service.rawPackages.length})
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {service.rawPackages.map((pkg) => (
                    <div
                      key={pkg.id}
                      className="space-y-2.5 rounded-xl border border-border/80 bg-background/70 p-3.5"
                    >
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="font-mono text-[10px] uppercase text-primary">
                          {pkg.tier_name}
                        </Badge>
                        <form action={deleteServicePackageAction}>
                          <input type="hidden" name="id" value={pkg.id} />
                          <Button
                            type="submit"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-1.5 text-[11px] text-destructive"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </form>
                      </div>

                      <form action={upsertServicePackageAction} className="space-y-2.5">
                        <input type="hidden" name="id" value={pkg.id} />
                        <input type="hidden" name="service_id" value={service.id} />
                        <input type="hidden" name="tier_name" value={pkg.tier_name} />
                        <div className="space-y-1">
                          <Label className="text-[11px]">Package Name</Label>
                          <Input
                            name="package_name"
                            defaultValue={pkg.package_name}
                            required
                            className="h-9 text-xs"
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="flex flex-col justify-end gap-1">
                            <Label className="mb-auto text-[10px]">Price (USD)</Label>
                            <Input
                              name="price_usd"
                              type="number"
                              defaultValue={Math.round(pkg.price_cents / 100)}
                              required
                              className="h-9 font-mono text-xs"
                            />
                          </div>
                          <div className="flex flex-col justify-end gap-1">
                            <Label className="mb-auto text-[10px]">Days</Label>
                            <Input
                              name="delivery_days"
                              type="number"
                              defaultValue={pkg.delivery_days}
                              required
                              className="h-9 font-mono text-xs"
                            />
                          </div>
                          <div className="flex flex-col justify-end gap-1">
                            <Label className="mb-auto text-[10px]">Revisions</Label>
                            <Input
                              name="revisions_included"
                              type="number"
                              defaultValue={pkg.revisions_included}
                              required
                              className="h-9 font-mono text-xs"
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px]">Summary</Label>
                          <Input
                            name="summary"
                            defaultValue={pkg.summary}
                            required
                            className="h-9 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px]">Features (One per line)</Label>
                          <Textarea
                            name="features"
                            rows={3}
                            defaultValue={(pkg.features ?? []).join('\n')}
                            className="font-mono text-[11px]"
                          />
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                          <div className="flex items-center gap-3">
                            <label className="flex items-center gap-1.5 text-[11px]">
                              <input
                                type="checkbox"
                                name="is_popular"
                                defaultChecked={pkg.is_popular}
                                className="h-3.5 w-3.5 rounded"
                              />
                              Most Popular
                            </label>
                            <label className="flex items-center gap-1.5 text-[11px]">
                              <input
                                type="checkbox"
                                name="is_active"
                                defaultChecked={pkg.is_active}
                                className="h-3.5 w-3.5 rounded"
                              />
                              Active
                            </label>
                          </div>
                          <Button type="submit" size="sm" variant="secondary" className="h-8 text-[11px]">
                            Update Tier
                          </Button>
                        </div>
                      </form>
                    </div>
                  ))}
                </div>

                {/* Add / Upsert a Tier Form */}
                <details className="rounded-xl border border-dashed border-border/80 bg-muted/20 p-3 text-xs">
                  <summary className="cursor-pointer font-semibold text-primary">
                    + Add or Replace a Package Tier for {service.title}
                  </summary>
                  <form action={upsertServicePackageAction} className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                    <input type="hidden" name="service_id" value={service.id} />
                    <div className="flex flex-col justify-end gap-1">
                      <Label className="mb-auto text-[11px]">Tier</Label>
                      <select
                        name="tier_name"
                        defaultValue="Standard"
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                      >
                        <option value="Starter">Starter</option>
                        <option value="Standard">Standard</option>
                        <option value="Enterprise">Enterprise</option>
                      </select>
                    </div>
                    <div className="flex flex-col justify-end gap-1 xl:col-span-2">
                      <Label className="mb-auto text-[11px]">Package Name</Label>
                      <Input name="package_name" placeholder="Standard Audit" required className="h-9 text-xs" />
                    </div>
                    <div className="flex flex-col justify-end gap-1">
                      <Label className="mb-auto text-[11px]">Price (USD)</Label>
                      <Input name="price_usd" type="number" defaultValue={500} required className="h-9 font-mono text-xs" />
                    </div>
                    <div className="flex flex-col justify-end gap-1">
                      <Label className="mb-auto text-[11px]">Delivery Days</Label>
                      <Input name="delivery_days" type="number" defaultValue={7} required className="h-9 font-mono text-xs" />
                    </div>
                    <div className="flex flex-col justify-end gap-1">
                      <Label className="mb-auto text-[11px]">Revisions</Label>
                      <Input name="revisions_included" type="number" defaultValue={2} required className="h-9 font-mono text-xs" />
                    </div>
                    <div className="flex flex-col justify-end gap-1 xl:col-span-3">
                      <Label className="mb-auto text-[11px]">Summary</Label>
                      <Input name="summary" placeholder="Ideal for production apps" required className="h-9 text-xs" />
                    </div>
                    <div className="flex flex-col justify-end gap-1 xl:col-span-3">
                      <Label className="mb-auto text-[11px]">Features (One per line)</Label>
                      <Textarea name="features" rows={2} placeholder="Feature 1&#10;Feature 2" className="font-mono text-xs" />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2 xl:col-span-6">
                      <label className="flex items-center gap-1.5 text-xs">
                        <input
                          type="checkbox"
                          name="is_active"
                          defaultChecked
                          className="h-4 w-4 rounded"
                        />
                        Active package tier
                      </label>
                      <Button type="submit" size="sm" className="h-9">
                        Save Package Tier
                      </Button>
                    </div>
                  </form>
                </details>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
