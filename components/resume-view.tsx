'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { useReactToPrint } from 'react-to-print';
import {
  Award,
  BookOpen,
  Briefcase,
  Download,
  ExternalLink,
  Globe,
  GraduationCap,
  Heart,
  Mail,
  MapPin,
  Phone,
  Printer,
  Users,
} from 'lucide-react';
import { GithubIcon, LinkedinIcon } from '@/components/social-links';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { PrintableResume } from '@/components/printable-resume';
import type { ResumeItemRecord, SiteSettingsRecord } from '@/lib/cms/queries';

export function ResumeView({
  settings,
  items,
}: {
  settings: SiteSettingsRecord;
  items: ResumeItemRecord[];
}) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `${settings.full_name.replace(/\s+/g, '_')}_Resume`,
    pageStyle: `
      @page {
        size: A4;
        margin: 0;
      }
      @media print {
        body {
          margin: 0 !important;
          padding: 0 !important;
        }
        html, body {
          height: 100%;
          overflow: visible;
        }
        @page { size: A4; margin: 0; }
      }
    `,
  });

  const personalInfo = {
    name: settings.full_name || 'Md. Redwan Ahmed',
    title: 'Computer Science & Engineering Professional',
    subtitle:
      settings.subtitle ||
      'Cybersecurity Researcher | Information Security Freelancer | Educator',
    email: settings.email || 'contact@redwan.work',
    phone: settings.phone || '+88017-7638-7624',
    location: settings.location || 'Dhaka, BD',
    linkedin: settings.linkedin_url || 'https://www.linkedin.com/in/redwancse',
    github: settings.github_url || 'https://github.com/redwan-cse',
    website: settings.website_url || 'https://redwan.work',
  };

  const vendorCertifications = items
    .filter((i) => i.section === 'vendor_certification')
    .map((i) => ({
      name: i.title,
      issuer: i.organization,
      date: i.period ?? '',
      verificationUrl: i.verification_url ?? undefined,
    }));

  const professionalCertificates = items
    .filter((i) => i.section === 'professional_certificate')
    .map((i) => ({
      name: i.title,
      issuer: i.organization,
      date: i.period ?? '',
      verificationUrl: i.verification_url ?? undefined,
    }));

  const researchItems = items.filter((i) => i.section === 'research');
  const journalResearch = researchItems[0] ?? {
    title: 'Data-Driven Strategies for Digital Native Market Segmentation Using Clustering',
    verification_url: 'https://doi.org/10.1016/j.ijcce.2024.04.002',
    highlights: [
      'Journal: International Journal of Cognitive Computing in Engineering',
      'Indexing: Scopus (Open Access)',
      'Quartile: Q1',
      'Publisher: Elsevier',
      'Online ISSN: 2666-3074',
    ],
  };
  const conferenceResearch = researchItems[1] ?? {
    title:
      'Phishing URL Detection Using Comprehensive Feature Extraction and Machine Learning Techniques',
    verification_url: 'https://s24.ieeecsbdc.org/papers/156',
    highlights: [
      'Conference: IEEE CS BDC SYMPOSIUM 2024',
      'Date: November 22-23, 2024',
      'Location: Jagannath University, Dhaka, Bangladesh',
    ],
  };

  const research = {
    journal: {
      title: journalResearch.title,
      url: journalResearch.verification_url ?? '#',
      details: journalResearch.highlights,
    },
    conference: {
      title: conferenceResearch.title,
      url: conferenceResearch.verification_url ?? '#',
      details: conferenceResearch.highlights,
    },
  };

  const experience = items
    .filter((i) => i.section === 'experience')
    .map((i) => ({
      title: i.title,
      company: i.organization,
      type: i.role_type ?? 'Remote',
      location: i.location ?? 'Worldwide',
      period: i.period ?? '',
      highlights: i.highlights,
    }));

  const leadership = items
    .filter((i) => i.section === 'leadership')
    .map((i) => ({
      title: i.title,
      organization: i.organization,
      period: i.period ?? '',
      highlights: i.highlights,
    }));

  const education = items
    .filter((i) => i.section === 'education')
    .map((i) => ({
      degree: i.title,
      institution: i.organization,
      location: i.location ?? '',
      period: i.period ?? '',
    }));

  const technicalSkills = settings.technical_skills ?? {};
  const softSkills = settings.soft_skills ?? [];
  const otherSkills = settings.other_skills ?? [];
  const hobbies = settings.hobbies ?? [];
  const references = settings.references_list ?? [];
  const researchInterests =
    settings.research_interests && settings.research_interests.length > 0
      ? settings.research_interests
      : ['Cyber Security', 'Machine Learning', 'Artificial Intelligence'];
  const summary = settings.executive_summary;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Hidden printable A4 version */}
      <div className="hidden">
        <PrintableResume
          ref={printRef}
          personalInfo={personalInfo}
          summary={summary}
          researchInterests={researchInterests}
          technicalSkills={technicalSkills}
          softSkills={softSkills}
          otherSkills={otherSkills}
          experience={experience}
          education={education}
          vendorCertifications={vendorCertifications}
          professionalCertificates={professionalCertificates}
          research={research}
          leadership={leadership}
          hobbies={hobbies}
          references={references}
        />
      </div>

      <div className="container py-10 md:py-12">
        <div className="mx-auto max-w-5xl space-y-8">
          {/* Header Section with Download & Print */}
          <Card className="overflow-hidden border-2 border-border/80 shadow-xs">
            <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-background p-6 sm:p-8">
              <div className="flex flex-col items-center gap-6 text-center md:flex-row md:justify-between md:text-left">
                <div className="flex-1 space-y-2">
                  <h1 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
                    {personalInfo.name}
                  </h1>
                  <p className="text-lg font-semibold text-primary sm:text-xl">
                    {personalInfo.title}
                  </p>
                  <p className="text-sm text-muted-foreground sm:text-base">
                    {personalInfo.subtitle}
                  </p>

                  {/* Contact Info */}
                  <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 pt-2 text-xs sm:text-sm md:justify-start">
                    <a
                      href={`mailto:${personalInfo.email}`}
                      className="inline-flex items-center gap-1.5 hover:text-primary"
                    >
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span>{personalInfo.email}</span>
                    </a>
                    <Separator orientation="vertical" className="hidden h-4 sm:block" />
                    <a
                      href={`tel:${personalInfo.phone.replace(/[^+\d]/g, '')}`}
                      className="inline-flex items-center gap-1.5 hover:text-primary"
                    >
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span>{personalInfo.phone}</span>
                    </a>
                    <Separator orientation="vertical" className="hidden h-4 sm:block" />
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span>{personalInfo.location}</span>
                    </span>
                    <Separator orientation="vertical" className="hidden h-4 sm:block" />
                    <a
                      href={personalInfo.linkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 hover:text-primary"
                    >
                      <LinkedinIcon className="h-4 w-4" />
                      <span>LinkedIn</span>
                    </a>
                    <Separator orientation="vertical" className="hidden h-4 sm:block" />
                    <a
                      href={personalInfo.github}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 hover:text-primary"
                    >
                      <GithubIcon className="h-4 w-4" />
                      <span>GitHub</span>
                    </a>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex w-full shrink-0 flex-col gap-2.5 sm:w-auto sm:min-w-[180px]">
                  <Button asChild size="default" className="w-full gap-2">
                    <a
                      href={settings.resume_pdf_url || '/resume.pdf'}
                      download="Md_Redwan_Ahmed_Resume.pdf"
                    >
                      <Download className="h-4 w-4" />
                      Download PDF
                    </a>
                  </Button>
                  <Button asChild variant="outline" size="default" className="w-full gap-2">
                    <a
                      href={personalInfo.linkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <LinkedinIcon className="h-4 w-4" />
                      LinkedIn Profile
                    </a>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="default"
                    onClick={handlePrint}
                    className="w-full gap-2"
                  >
                    <Printer className="h-4 w-4" />
                    Print CV
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          {/* 1. Summary */}
          <Card className="border-l-4 border-l-primary">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-xl sm:text-2xl">
                <Briefcase className="h-5 w-5 text-primary" />
                Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
                {summary}
              </p>
            </CardContent>
          </Card>

          {/* 2. Research Interests */}
          <Card className="border-l-4 border-l-primary">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-xl sm:text-2xl">
                <BookOpen className="h-5 w-5 text-primary" />
                Research Interests
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {researchInterests.map((interest) => (
                  <Badge key={interest} variant="secondary" className="px-3 py-1.5 text-xs sm:text-sm">
                    {interest}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 3. Professional Experience */}
          <Card id="experience" className="scroll-mt-24 border-l-4 border-l-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl sm:text-2xl">
                <Briefcase className="h-5 w-5 text-primary" />
                Professional Experience
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {experience.map((job, index) => (
                <div
                  key={index}
                  className="relative pl-6 before:absolute before:top-2 before:left-0 before:h-3 before:w-3 before:rounded-full before:bg-primary"
                >
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1">
                      <h3 className="text-base font-semibold sm:text-lg">{job.title}</h3>
                      <p className="text-sm font-medium text-primary sm:text-base">
                        {job.company}
                      </p>
                      <p className="text-xs text-muted-foreground sm:text-sm">
                        {job.type} · {job.location}
                      </p>
                    </div>
                    <Badge variant="outline" className="w-fit font-mono text-xs">
                      {job.period}
                    </Badge>
                  </div>
                  {job.highlights && job.highlights.length > 0 && (
                    <ul className="mt-2.5 space-y-1.5 text-sm text-muted-foreground">
                      {job.highlights.map((highlight, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                          <span>{highlight}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {index < experience.length - 1 && <Separator className="mt-6" />}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* 4. Education */}
          <Card id="education" className="scroll-mt-24 border-l-4 border-l-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl sm:text-2xl">
                <GraduationCap className="h-5 w-5 text-primary" />
                Education
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {education.map((edu, index) => (
                <div key={index}>
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1">
                      <h3 className="text-base font-semibold sm:text-lg">{edu.degree}</h3>
                      <p className="text-sm font-medium text-primary sm:text-base">
                        {edu.institution}
                      </p>
                      <p className="text-xs text-muted-foreground sm:text-sm">
                        {edu.location}
                      </p>
                    </div>
                    <Badge variant="outline" className="w-fit font-mono text-xs">
                      {edu.period}
                    </Badge>
                  </div>
                  {index < education.length - 1 && <Separator className="mt-6" />}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* 5. Technical Skills */}
          <Card id="skills" className="scroll-mt-24 border-l-4 border-l-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl sm:text-2xl">
                <Award className="h-5 w-5 text-primary" />
                Technical Skills
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {Object.entries(technicalSkills).map(([category, skills]) => (
                <div key={category}>
                  <h3 className="mb-2.5 text-sm font-semibold text-primary sm:text-base">
                    {category}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {(Array.isArray(skills) ? skills : []).map((skill) => (
                      <Badge key={skill} variant="secondary" className="px-3 py-1 text-xs">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}

              {softSkills.length > 0 && (
                <div className="pt-2">
                  <h3 className="mb-2.5 text-sm font-semibold text-primary sm:text-base">
                    Soft Skills
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {softSkills.map((skill) => (
                      <Badge key={skill} variant="outline" className="px-3 py-1 text-xs">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {otherSkills.length > 0 && (
                <div className="pt-2">
                  <h3 className="mb-2.5 text-sm font-semibold text-primary sm:text-base">
                    Other Skills
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {otherSkills.map((skill) => (
                      <Badge key={skill} variant="outline" className="px-3 py-1 text-xs">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 6. Certifications (Exam/Vendor) */}
          <Card id="certifications" className="scroll-mt-24 border-l-4 border-l-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl sm:text-2xl">
                <Award className="h-5 w-5 text-primary" />
                Certifications
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {vendorCertifications.map((cert, index) => (
                <div
                  key={index}
                  className="rounded-lg border border-border/80 bg-card p-4 transition-colors hover:bg-accent/60"
                >
                  {cert.verificationUrl ? (
                    <Link
                      href={cert.verificationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group"
                    >
                      <h3 className="mb-1 flex items-center gap-2 font-semibold group-hover:text-primary">
                        <span>{cert.name}</span>
                        <ExternalLink className="h-4 w-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                      </h3>
                    </Link>
                  ) : (
                    <h3 className="mb-1 font-semibold">{cert.name}</h3>
                  )}
                  <p className="text-sm text-muted-foreground">{cert.issuer}</p>
                  <p className="mt-2 font-mono text-xs text-muted-foreground">{cert.date}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* 7. Professional Certificates & Course Completions */}
          <Card className="border-l-4 border-l-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl sm:text-2xl">
                <Award className="h-5 w-5 text-primary" />
                Professional Certificates &amp; Course Completions
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {professionalCertificates.map((cert, index) => (
                <div
                  key={index}
                  className="rounded-lg border border-border/80 bg-card p-4 transition-colors hover:bg-accent/60"
                >
                  {cert.verificationUrl ? (
                    <Link
                      href={cert.verificationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group"
                    >
                      <h3 className="mb-1 flex items-center gap-2 font-semibold group-hover:text-primary">
                        <span>{cert.name}</span>
                        <ExternalLink className="h-4 w-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                      </h3>
                    </Link>
                  ) : (
                    <h3 className="mb-1 font-semibold">{cert.name}</h3>
                  )}
                  <p className="text-sm text-muted-foreground">{cert.issuer}</p>
                  <p className="mt-2 font-mono text-xs text-muted-foreground">{cert.date}</p>
                </div>
              ))}
              <div className="col-span-full rounded-lg border border-border/80 bg-card p-4 transition-colors hover:bg-accent/60">
                <Link
                  href="https://drive.google.com/drive/folders/1JZvV08biy77fcW0_R9BJQEvBZuPH4ZVj?usp=sharing"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
                >
                  <ExternalLink className="h-4 w-4" />
                  <span>View full list of course certificates</span>
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* 8. Research & Publications */}
          <Card id="research" className="scroll-mt-24 border-l-4 border-l-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl sm:text-2xl">
                <BookOpen className="h-5 w-5 text-primary" />
                Research &amp; Publications
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {researchItems.map((pub) => (
                <div key={pub.id} className="rounded-lg border border-border/80 bg-card p-6">
                  <div className="mb-2.5 flex flex-wrap items-center gap-2">
                    <Badge variant="default">{pub.organization || 'Journal Paper'}</Badge>
                    {pub.badge_label && (
                      <Badge variant="secondary">{pub.badge_label}</Badge>
                    )}
                  </div>
                  {pub.verification_url ? (
                    <Link
                      href={pub.verification_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group"
                    >
                      <h3 className="mb-3 flex items-center gap-2 text-base font-semibold group-hover:text-primary sm:text-lg">
                        <span>{pub.title}</span>
                        <ExternalLink className="h-4 w-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                      </h3>
                    </Link>
                  ) : (
                    <h3 className="mb-3 text-base font-semibold sm:text-lg">{pub.title}</h3>
                  )}
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    {pub.highlights.map((detail, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* 9. Leadership Experience */}
          <Card id="leadership" className="scroll-mt-24 border-l-4 border-l-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl sm:text-2xl">
                <Users className="h-5 w-5 text-primary" />
                Leadership Experience
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {leadership.map((role, index) => (
                <div key={index}>
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1">
                      <h3 className="text-base font-semibold sm:text-lg">{role.title}</h3>
                      <p className="text-sm font-medium text-primary sm:text-base">
                        {role.organization}
                      </p>
                    </div>
                    <Badge variant="outline" className="w-fit font-mono text-xs">
                      {role.period}
                    </Badge>
                  </div>
                  {role.highlights && role.highlights.length > 0 && (
                    <ul className="mt-2.5 space-y-1.5 text-sm text-muted-foreground">
                      {role.highlights.map((highlight, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                          <span>{highlight}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {index < leadership.length - 1 && <Separator className="mt-6" />}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* 10. Languages */}
          <Card className="border-l-4 border-l-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl sm:text-2xl">
                <Globe className="h-5 w-5 text-primary" />
                Languages
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-center justify-between rounded-lg border border-border/80 bg-card p-4">
                  <span className="font-semibold">Bengali</span>
                  <Badge variant="default">Native</Badge>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border/80 bg-card p-4">
                  <span className="font-semibold">English</span>
                  <Badge variant="default">Fluent</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 11. Hobbies & Interests */}
          {hobbies.length > 0 && (
            <Card className="border-l-4 border-l-primary">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl sm:text-2xl">
                  <Heart className="h-5 w-5 text-primary" />
                  Hobbies &amp; Interests
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                {hobbies.map((hobby, index) => (
                  <div
                    key={index}
                    className="rounded-lg border border-border/80 bg-card p-4"
                  >
                    <h3 className="mb-1.5 font-semibold">{hobby.name}</h3>
                    <p className="text-sm text-muted-foreground">{hobby.description}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* 12. Academic References */}
          {references.length > 0 && (
            <Card className="border-l-4 border-l-primary">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl sm:text-2xl">
                  <Users className="h-5 w-5 text-primary" />
                  Academic References
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                {references.map((refItem, index) => (
                  <div
                    key={index}
                    className="rounded-lg border border-border/80 bg-card p-4 space-y-1"
                  >
                    <h3 className="font-semibold text-foreground">{refItem.name}</h3>
                    <p className="text-xs font-medium text-primary">{refItem.title}</p>
                    <p className="text-xs text-muted-foreground">{refItem.institution}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-xs text-muted-foreground">
                      <a href={`mailto:${refItem.email}`} className="hover:text-primary">
                        {refItem.email}
                      </a>
                      <span>{refItem.phone}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Bottom Footer Actions */}
          <div className="flex flex-wrap justify-center gap-4 pt-4">
            <Button asChild size="lg" className="gap-2">
              <a
                href={settings.resume_pdf_url || '/resume.pdf'}
                download="Md_Redwan_Ahmed_Resume.pdf"
              >
                <Download className="h-5 w-5" />
                Download CV
              </a>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={handlePrint}
              className="gap-2"
            >
              <Printer className="h-5 w-5" />
              Print Resume
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
