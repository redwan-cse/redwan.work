import Link from 'next/link';
import { Save, UserCheck } from 'lucide-react';
import { AdminHubHeader } from '@/components/admin/hub-header';
import { ContentAssetsPanel } from '@/components/admin/content-assets-panel';
import { ContentBlogsPanel } from '@/components/admin/content-blogs-panel';
import {
  PortfolioStudioTable,
  ResumeItemsStudioTable,
  ServicesStudioTable,
} from '@/components/admin/content-studio-drawers';
import { ResumePdfManager } from '@/components/admin/resume-pdf-manager';
import { SkillsMatrixEditor } from '@/components/admin/skills-matrix-editor';
import { ActionFeedbackForm } from '@/components/panel/action-feedback-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { updateSiteSettingsAction } from '@/lib/cms/actions';
import {
  getPublicPortfolioItems,
  getPublicServicesCatalog,
  getSiteSettingsAndResume,
} from '@/lib/cms/queries';
import { isPublicR2Configured } from '@/lib/r2';

export async function ContentHubView({
  activeTab,
  basePath = '/admin/content',
}: {
  activeTab: 'services' | 'portfolio' | 'resume' | 'assets' | 'blogs';
  basePath?: string;
}) {
  const [services, portfolioList, resumeData] = await Promise.all([
    activeTab === 'services' ? getPublicServicesCatalog({ includeHidden: true }) : Promise.resolve([]),
    activeTab === 'portfolio' ? getPublicPortfolioItems({ includeUnpublished: true }) : Promise.resolve([]),
    activeTab === 'resume' ? getSiteSettingsAndResume({ includeHidden: true }) : Promise.resolve(null),
  ]);

  const tabHref = (id: string) =>
    basePath === '/admin/services' && id === 'services'
      ? '/admin/services'
      : basePath === '/admin/portfolio' && id === 'portfolio'
        ? '/admin/portfolio'
        : basePath === '/admin/resume' && id === 'resume'
          ? '/admin/resume'
          : `/admin/content?tab=${id}`;

  const tabs = [
    { id: 'services', label: 'Services & Tiers', href: tabHref('services') },
    { id: 'portfolio', label: 'Portfolio Studies', href: tabHref('portfolio') },
    { id: 'resume', label: 'Resume & Profile', href: tabHref('resume') },
    { id: 'assets', label: 'Public R2 Assets', href: tabHref('assets') },
    { id: 'blogs', label: 'Blogs Sync', href: tabHref('blogs') },
  ];

  return (
    <div className="space-y-6">
      <AdminHubHeader
        eyebrow="CONTENT STUDIO & PUBLIC CATALOG CMS"
        title="Services, Portfolio, Resume & Public Assets"
        description="Dense catalog overview with slide-over edit drawers. Updates sync immediately across /, /services/[slug], /portfolio/[slug], /resume, and Client Order Store."
        tabs={tabs}
        activeTab={activeTab}
      />

      {activeTab === 'services' && <ServicesStudioTable services={services} />}

      {activeTab === 'portfolio' && <PortfolioStudioTable studies={portfolioList} />}

      {activeTab === 'resume' && resumeData && (
        <div className="space-y-6">
          <ResumePdfManager
            initialUrl={resumeData.settings.resume_pdf_url}
            r2Configured={isPublicR2Configured()}
          />

          <ResumeItemsStudioTable items={resumeData.items} />

          <Card className="border-border/80">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <UserCheck className="h-4 w-4 text-primary" />
                Personal Profile, Contact Info &amp; Skills Matrix
              </CardTitle>
              <CardDescription className="text-xs">
                Controls the CV header, contact links, executive bio, and skill categories on /resume.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ActionFeedbackForm
                action={updateSiteSettingsAction}
                successMessage="Site profile & skills matrix saved."
                className="space-y-3.5"
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Full Name *</Label>
                    <Input name="full_name" aria-label="Full Name" defaultValue={resumeData.settings.full_name} required className="h-9 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Role Title *</Label>
                    <Input name="role_title" aria-label="Role Title" defaultValue={resumeData.settings.role_title} required className="h-9 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Short Role</Label>
                    <Input name="short_role" aria-label="Short Role" defaultValue={resumeData.settings.short_role} className="h-9 text-xs" />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Subtitle</Label>
                    <Input name="subtitle" aria-label="Subtitle" defaultValue={resumeData.settings.subtitle} className="h-9 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Tagline</Label>
                    <Input name="tagline" aria-label="Tagline" defaultValue={resumeData.settings.tagline} className="h-9 text-xs" />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="space-y-1">
                    <Label className="text-xs">Email *</Label>
                    <Input name="email" aria-label="Public Email" defaultValue={resumeData.settings.email} required className="h-9 font-mono text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Phone *</Label>
                    <Input name="phone" aria-label="Phone Number" defaultValue={resumeData.settings.phone} required className="h-9 font-mono text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">WhatsApp</Label>
                    <Input name="whatsapp_number" aria-label="WhatsApp Number" defaultValue={resumeData.settings.whatsapp_number} className="h-9 font-mono text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Location *</Label>
                    <Input name="location" aria-label="Location" defaultValue={resumeData.settings.location} required className="h-9 text-xs" />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                  <div className="space-y-1">
                    <Label className="text-xs">Cal.com URL</Label>
                    <Input name="cal_com_url" aria-label="Cal.com URL" defaultValue={resumeData.settings.cal_com_url} className="h-9 font-mono text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">LinkedIn URL</Label>
                    <Input name="linkedin_url" aria-label="LinkedIn URL" defaultValue={resumeData.settings.linkedin_url} className="h-9 font-mono text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">GitHub URL</Label>
                    <Input name="github_url" aria-label="GitHub URL" defaultValue={resumeData.settings.github_url} className="h-9 font-mono text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Company Name</Label>
                    <Input name="company_name" aria-label="Company Name" defaultValue={resumeData.settings.company_name} className="h-9 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Company URL</Label>
                    <Input name="company_url" aria-label="Company URL" defaultValue={resumeData.settings.company_url} className="h-9 font-mono text-xs" />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Website URL</Label>
                    <Input name="website_url" aria-label="Website URL" defaultValue={resumeData.settings.website_url} className="h-9 font-mono text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Resume PDF URL</Label>
                    <Input name="resume_pdf_url" aria-label="Resume PDF URL" defaultValue={resumeData.settings.resume_pdf_url} className="h-9 font-mono text-xs" />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Executive Bio *</Label>
                  <Textarea name="executive_summary" aria-label="Executive Bio" rows={3} defaultValue={resumeData.settings.executive_summary} required className="text-xs" />
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Research Interests</Label>
                    <Textarea
                      name="research_interests"
                      aria-label="Research Interests"
                      rows={3}
                      defaultValue={(resumeData.settings.research_interests ?? []).join('\n')}
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Soft Skills</Label>
                    <Textarea
                      name="soft_skills"
                      aria-label="Soft Skills"
                      rows={3}
                      defaultValue={(resumeData.settings.soft_skills ?? []).join('\n')}
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Other Skills</Label>
                    <Textarea
                      name="other_skills"
                      aria-label="Other Skills"
                      rows={3}
                      defaultValue={(resumeData.settings.other_skills ?? []).join('\n')}
                      className="font-mono text-xs"
                    />
                  </div>
                </div>

                <SkillsMatrixEditor initialSkills={resumeData.settings.technical_skills ?? {}} />

                <div className="flex justify-end">
                  <Button type="submit" size="sm" className="gap-1.5 rounded-full">
                    <Save className="h-4 w-4" />
                    Save Profile &amp; Skills Matrix
                  </Button>
                </div>
              </ActionFeedbackForm>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'assets' && <ContentAssetsPanel />}

      {activeTab === 'blogs' && <ContentBlogsPanel />}
    </div>
  );
}
