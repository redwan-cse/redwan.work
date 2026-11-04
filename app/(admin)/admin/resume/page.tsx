import { Plus, Save, Trash2, UserCheck } from 'lucide-react';
import { getSiteSettingsAndResume } from '@/lib/cms/queries';
import {
  deleteResumeItemAction,
  updateSiteSettingsAction,
  upsertResumeItemAction,
} from '@/lib/cms/actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export const dynamic = 'force-dynamic';

export default async function AdminResumeCmsPage() {
  const { settings, items } = await getSiteSettingsAndResume({ includeHidden: true });

  return (
    <div className="space-y-8">
      <div>
        <Badge variant="outline" className="mb-2 font-mono text-xs text-primary">
          DATABASE-DRIVEN RESUME &amp; SITE PROFILE CMS
        </Badge>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Resume, Credentials &amp; Site Profile Management
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Update your personal profile, executive summary, skill matrices, certifications, peer-reviewed research, work experience, and education. Changes update `/resume`, `/contact`, and `/` immediately.
        </p>
      </div>

      {/* 1. Site Settings & Skills Matrix */}
      <Card className="border-primary/35 bg-card/90">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserCheck className="h-5 w-5 text-primary" />
            Personal Profile, Contact Info &amp; Skills Matrix
          </CardTitle>
          <CardDescription className="text-xs">
            Controls the CV header, contact info, executive bio, and skill pills on `/resume`.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateSiteSettingsAction} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">Full Name *</Label>
                <Input name="full_name" defaultValue={settings.full_name} required className="h-9 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Role Title *</Label>
                <Input name="role_title" defaultValue={settings.role_title} required className="h-9 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Short Role</Label>
                <Input name="short_role" defaultValue={settings.short_role} className="h-9 text-xs" />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Subtitle</Label>
                <Input name="subtitle" defaultValue={settings.subtitle} className="h-9 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tagline</Label>
                <Input name="tagline" defaultValue={settings.tagline} className="h-9 text-xs" />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-xs">Email *</Label>
                <Input name="email" defaultValue={settings.email} required className="h-9 font-mono text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Phone *</Label>
                <Input name="phone" defaultValue={settings.phone} required className="h-9 font-mono text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">WhatsApp Number</Label>
                <Input name="whatsapp_number" defaultValue={settings.whatsapp_number} className="h-9 font-mono text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Location *</Label>
                <Input name="location" defaultValue={settings.location} required className="h-9 text-xs" />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-5">
              <div className="space-y-1">
                <Label className="text-xs">Cal.com URL</Label>
                <Input name="cal_com_url" defaultValue={settings.cal_com_url} className="h-8 font-mono text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">LinkedIn URL</Label>
                <Input name="linkedin_url" defaultValue={settings.linkedin_url} className="h-8 font-mono text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">GitHub URL</Label>
                <Input name="github_url" defaultValue={settings.github_url} className="h-8 font-mono text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Company Name</Label>
                <Input name="company_name" defaultValue={settings.company_name} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Company URL</Label>
                <Input name="company_url" defaultValue={settings.company_url} className="h-8 font-mono text-xs" />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Executive Bio / Resume Summary *</Label>
              <Textarea
                name="executive_summary"
                rows={3}
                defaultValue={settings.executive_summary}
                required
                className="text-xs"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">Research Interests (One per line)</Label>
                <Textarea
                  name="research_interests"
                  rows={4}
                  defaultValue={(settings.research_interests ?? []).join('\n')}
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Soft Skills (One per line)</Label>
                <Textarea
                  name="soft_skills"
                  rows={4}
                  defaultValue={(settings.soft_skills ?? []).join('\n')}
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Operational / Other Skills (One per line)</Label>
                <Textarea
                  name="other_skills"
                  rows={4}
                  defaultValue={(settings.other_skills ?? []).join('\n')}
                  className="font-mono text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Technical Skills Categories (JSON Map)</Label>
              <Textarea
                name="technical_skills_json"
                rows={5}
                defaultValue={JSON.stringify(settings.technical_skills ?? {}, null, 2)}
                className="font-mono text-xs"
              />
            </div>

            <div className="flex justify-end">
              <Button type="submit" size="sm" className="gap-1.5 rounded-full">
                <Save className="h-4 w-4" />
                Save Profile &amp; Skills Matrix
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* 2. Add New Resume Item */}
      <Card className="border-border/80 bg-card/90">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Plus className="h-5 w-5 text-primary" />
            Add New Resume Entry (Experience, Certification, Research, Education, Leadership)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={upsertResumeItemAction} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-xs">Section *</Label>
                <select
                  name="section"
                  defaultValue="experience"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                >
                  <option value="experience">Work Experience</option>
                  <option value="vendor_certification">Vendor Certification (e.g. C|EH)</option>
                  <option value="professional_certificate">Professional Certificate</option>
                  <option value="research">Peer-Reviewed Research</option>
                  <option value="leadership">Leadership &amp; Volunteering</option>
                  <option value="education">Academic Education</option>
                </select>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Title / Role / Degree / Paper Title *</Label>
                <Input
                  name="title"
                  required
                  placeholder="e.g. Senior Security Consultant"
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Period / Year Label</Label>
                <Input
                  name="period"
                  placeholder="2025 – Present"
                  className="h-9 font-mono text-xs"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-xs">Organization / Issuer / Journal</Label>
                <Input name="organization" placeholder="EC-Council / Elsevier" className="h-9 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Role Type / Location</Label>
                <Input name="role_type" placeholder="Full-Time / Remote" className="h-9 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Badge Label (e.g. Q1 Scopus / Validated)</Label>
                <Input name="badge_label" placeholder="Active & Verified" className="h-9 font-mono text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Verification / DOI Link</Label>
                <Input name="verification_url" placeholder="https://..." className="h-9 font-mono text-xs" />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Highlights / Bullet Points (One per line)</Label>
              <Textarea name="highlights" rows={3} className="font-mono text-xs" />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-xs">
                <Label className="text-xs">Sort Order</Label>
                <Input name="sort_order" type="number" defaultValue={10} className="h-8 w-20 font-mono text-xs" />
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" name="is_visible" defaultChecked className="h-4 w-4 rounded" />
                  Visible
                </label>
              </div>
              <Button type="submit" size="sm" className="gap-1.5 rounded-full">
                <Plus className="h-4 w-4" />
                Add Resume Entry
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* 3. Existing Resume Entries */}
      <div className="space-y-4">
        {items.map((item) => (
          <Card key={item.id} className="border-border/80 bg-card/90">
            <CardContent className="p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="font-mono text-[10px] uppercase">
                    {item.section}
                  </Badge>
                  <span className="text-sm font-bold">{item.title}</span>
                  {item.organization && (
                    <span className="text-xs text-muted-foreground">· {item.organization}</span>
                  )}
                </div>
                <form action={deleteResumeItemAction}>
                  <input type="hidden" name="id" value={item.id} />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-xs text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </Button>
                </form>
              </div>

              <form action={upsertResumeItemAction} className="space-y-3">
                <input type="hidden" name="id" value={item.id} />
                <div className="grid gap-2.5 sm:grid-cols-4">
                  <div>
                    <Label className="text-[11px]">Section</Label>
                    <select
                      name="section"
                      defaultValue={item.section}
                      className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                    >
                      <option value="experience">experience</option>
                      <option value="vendor_certification">vendor_certification</option>
                      <option value="professional_certificate">professional_certificate</option>
                      <option value="research">research</option>
                      <option value="leadership">leadership</option>
                      <option value="education">education</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-[11px]">Title</Label>
                    <Input name="title" defaultValue={item.title} required className="h-8 text-xs" />
                  </div>
                  <div>
                    <Label className="text-[11px]">Period</Label>
                    <Input name="period" defaultValue={item.period ?? ''} className="h-8 font-mono text-xs" />
                  </div>
                </div>

                <div className="grid gap-2.5 sm:grid-cols-4">
                  <div>
                    <Label className="text-[11px]">Organization / Issuer</Label>
                    <Input name="organization" defaultValue={item.organization ?? ''} className="h-8 text-xs" />
                  </div>
                  <div>
                    <Label className="text-[11px]">Role Type</Label>
                    <Input name="role_type" defaultValue={item.role_type ?? ''} className="h-8 text-xs" />
                  </div>
                  <div>
                    <Label className="text-[11px]">Badge Label</Label>
                    <Input name="badge_label" defaultValue={item.badge_label ?? ''} className="h-8 font-mono text-xs" />
                  </div>
                  <div>
                    <Label className="text-[11px]">Verification / DOI URL</Label>
                    <Input name="verification_url" defaultValue={item.verification_url ?? ''} className="h-8 font-mono text-xs" />
                  </div>
                </div>

                <div>
                  <Label className="text-[11px]">Highlights / Bullets (One per line)</Label>
                  <Textarea
                    name="highlights"
                    rows={2}
                    defaultValue={(item.highlights ?? []).join('\n')}
                    className="font-mono text-xs"
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-3 text-xs">
                    <Label className="text-[11px]">Sort Order</Label>
                    <Input
                      name="sort_order"
                      type="number"
                      defaultValue={item.sort_order}
                      className="h-7 w-16 font-mono text-xs"
                    />
                    <label className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        name="is_visible"
                        defaultChecked={item.is_visible}
                        className="h-3.5 w-3.5 rounded"
                      />
                      Visible
                    </label>
                  </div>
                  <Button type="submit" size="sm" variant="outline" className="h-7 gap-1 text-xs">
                    <Save className="h-3 w-3" />
                    Update Entry
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
