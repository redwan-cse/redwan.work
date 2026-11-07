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
  FileText,
  Github,
  Globe,
  GraduationCap,
  Heart,
  Linkedin,
  Mail,
  MapPin,
  Phone,
  Printer,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { PrintableResume } from '@/components/printable-resume';
import { AntigravityHeroField } from '@/components/motion/antigravity-hero-field';
import {
  HeroReveal,
  HeroRevealItem,
  InteractiveCard,
  ScrollReveal,
} from '@/components/motion/reveal';
import type { ResumeItemRecord, SiteSettingsRecord } from '@/lib/cms/queries';

const SECTION_JUMPS = [
  { label: 'Experience', href: '#experience' },
  { label: 'Certifications', href: '#certifications' },
  { label: 'Research (Q1/IEEE)', href: '#research' },
  { label: 'Skills', href: '#skills' },
  { label: 'Education', href: '#education' },
  { label: 'Leadership', href: '#leadership' },
];

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
    name: settings.full_name,
    title: settings.role_title,
    subtitle: settings.subtitle,
    email: settings.email,
    phone: settings.phone,
    location: settings.location,
    linkedin: settings.linkedin_url,
    github: settings.github_url,
    website: settings.website_url,
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
    ],
  };
  const conferenceResearch = researchItems[1] ?? {
    title:
      'Phishing URL Detection Using Comprehensive Feature Extraction and Machine Learning Techniques',
    verification_url: 'https://s24.ieeecsbdc.org/papers/156',
    highlights: [
      'Conference: IEEE CS BDC SYMPOSIUM 2024',
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
  const researchInterests = settings.research_interests ?? [];
  const summary = settings.executive_summary;

  return (
    <div className="flex flex-col">
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

      {/* Antigravity Hero Header */}
      <section className="relative overflow-hidden border-b border-border/70 py-14 md:py-20">
        <AntigravityHeroField />
        <div className="container relative z-10">
          <HeroReveal className="mx-auto max-w-5xl">
            <div className="flex flex-col justify-between gap-8 rounded-2xl border border-border/80 bg-card/75 p-6 shadow-sm backdrop-blur-md sm:p-8 lg:flex-row lg:items-center">
              <div className="space-y-3">
                <HeroRevealItem>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="gap-1.5 font-mono text-xs text-primary">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      CCEP · GitHub · CNSP · CAP
                    </Badge>
                    <Badge variant="secondary" className="font-mono text-xs">
                      Q1 Scopus &amp; IEEE Author
                    </Badge>
                  </div>
                </HeroRevealItem>

                <HeroRevealItem>
                  <h1 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
                    {personalInfo.name}
                  </h1>
                </HeroRevealItem>

                <HeroRevealItem>
                  <p className="text-base font-semibold text-primary sm:text-lg">
                    {personalInfo.title}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {personalInfo.subtitle}
                  </p>
                </HeroRevealItem>

                <HeroRevealItem>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-2 text-xs text-muted-foreground sm:text-sm">
                    <a
                      href={`mailto:${personalInfo.email}`}
                      className="inline-flex items-center gap-1.5 hover:text-primary"
                    >
                      <Mail className="h-4 w-4 text-primary" />
                      <span>{personalInfo.email}</span>
                    </a>
                    <a
                      href={`tel:${personalInfo.phone.replace(/[^+\d]/g, '')}`}
                      className="inline-flex items-center gap-1.5 hover:text-primary"
                    >
                      <Phone className="h-4 w-4 text-primary" />
                      <span>{personalInfo.phone}</span>
                    </a>
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-4 w-4 text-primary" />
                      <span>{personalInfo.location}</span>
                    </span>
                    <a
                      href={personalInfo.linkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 hover:text-primary"
                    >
                      <Linkedin className="h-4 w-4 text-primary" />
                      <span>LinkedIn</span>
                    </a>
                    <a
                      href={personalInfo.github}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 hover:text-primary"
                    >
                      <Github className="h-4 w-4 text-primary" />
                      <span>GitHub</span>
                    </a>
                  </div>
                </HeroRevealItem>
              </div>

              {/* PDF & Print Actions */}
              <HeroRevealItem className="flex shrink-0 flex-wrap gap-2.5 lg:flex-col">
                <Button onClick={handlePrint} className="gap-2 rounded-full">
                  <Printer className="h-4 w-4" />
                  Generate A4 PDF
                </Button>
                <Button asChild variant="outline" className="gap-2 rounded-full">
                  <a href={settings.resume_pdf_url || '/resume.pdf'} download="Md_Redwan_Ahmed_Resume.pdf">
                    <Download className="h-4 w-4" />
                    Download CV
                  </a>
                </Button>
                <Button asChild variant="ghost" size="sm" className="gap-1.5 rounded-full text-xs">
                  <a href={settings.resume_pdf_url || '/resume.pdf'} target="_blank" rel="noopener noreferrer">
                    <FileText className="h-3.5 w-3.5" />
                    Open Raw PDF
                  </a>
                </Button>
              </HeroRevealItem>
            </div>

            {/* Section Jump Pills */}
            <HeroRevealItem className="mt-6 flex flex-wrap items-center justify-center gap-2">
              {SECTION_JUMPS.map((jump) => (
                <a
                  key={jump.href}
                  href={jump.href}
                  className="rounded-full border border-border/80 bg-card/70 px-3.5 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                >
                  {jump.label}
                </a>
              ))}
            </HeroRevealItem>
          </HeroReveal>
        </div>
      </section>

      {/* Main Resume Body */}
      <div className="container py-14">
        <div className="mx-auto max-w-5xl space-y-10">
          {/* Executive Summary & Research Focus */}
          <ScrollReveal>
            <div className="grid gap-6 lg:grid-cols-12">
              <Card className="border-border/80 lg:col-span-8">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Briefcase className="h-5 w-5 text-primary" />
                    Executive Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
                    {summary}
                  </p>
                </CardContent>
              </Card>

              <Card className="border-border/80 lg:col-span-4">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <BookOpen className="h-5 w-5 text-primary" />
                    Research Domains
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {researchInterests.map((interest) => (
                    <Badge
                      key={interest}
                      variant="secondary"
                      className="px-3 py-1 font-mono text-xs"
                    >
                      {interest}
                    </Badge>
                  ))}
                </CardContent>
              </Card>
            </div>
          </ScrollReveal>

          {/* Certifications (Vendor & Exam) */}
          <ScrollReveal>
            <div id="certifications" className="scroll-mt-24 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight">
                  <Award className="h-6 w-6 text-primary" />
                  Vendor &amp; Exam Certifications
                </h2>
                <Badge variant="outline" className="font-mono text-xs text-primary">
                  Verified Credentials
                </Badge>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {vendorCertifications.map((cert, index) => (
                  <InteractiveCard key={index} className="p-5">
                    <div className="flex h-full flex-col justify-between gap-3">
                      <div>
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-semibold text-primary">
                            {cert.issuer}
                          </span>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {cert.date}
                          </span>
                        </div>
                        {cert.verificationUrl ? (
                          <Link
                            href={cert.verificationUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group/link inline-flex items-start gap-1.5 font-semibold hover:text-primary"
                          >
                            <span>{cert.name}</span>
                            <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 opacity-60 transition-opacity group-hover/link:opacity-100" />
                          </Link>
                        ) : (
                          <h3 className="font-semibold">{cert.name}</h3>
                        )}
                      </div>
                    </div>
                  </InteractiveCard>
                ))}
              </div>
            </div>
          </ScrollReveal>

          {/* Research & Publications */}
          <ScrollReveal>
            <div id="research" className="scroll-mt-24 space-y-4">
              <h2 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight">
                <BookOpen className="h-6 w-6 text-primary" />
                Peer-Reviewed Research &amp; Publications
              </h2>

              <div className="grid gap-6 md:grid-cols-2">
                {researchItems.map((pub) => (
                  <InteractiveCard key={pub.id} className="p-6">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <Badge>{pub.organization || 'Publication'}</Badge>
                      {pub.badge_label && (
                        <Badge variant="outline" className="font-mono text-xs text-primary">
                          {pub.badge_label}
                        </Badge>
                      )}
                    </div>
                    {pub.verification_url ? (
                      <Link
                        href={pub.verification_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group/link"
                      >
                        <h3 className="text-lg font-bold leading-snug group-hover/link:text-primary">
                          {pub.title}{' '}
                          <ExternalLink className="inline h-4 w-4 text-primary" />
                        </h3>
                      </Link>
                    ) : (
                      <h3 className="text-lg font-bold leading-snug">{pub.title}</h3>
                    )}
                    <ul className="mt-4 space-y-1.5 text-xs text-muted-foreground">
                      {pub.highlights.map((detail, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                          <span>{detail}</span>
                        </li>
                      ))}
                    </ul>
                  </InteractiveCard>
                ))}
              </div>
            </div>
          </ScrollReveal>

          {/* Professional Experience */}
          <ScrollReveal>
            <Card id="experience" className="scroll-mt-24 border-border/80">
              <CardHeader>
                <CardTitle className="flex items-center gap-2.5 text-2xl">
                  <Briefcase className="h-6 w-6 text-primary" />
                  Professional Experience
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {experience.map((job, index) => (
                  <div
                    key={index}
                    className="relative pl-6 before:absolute before:top-2 before:left-0 before:h-2.5 before:w-2.5 before:rounded-full before:bg-primary"
                  >
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-lg font-bold">{job.title}</h3>
                        <p className="text-sm font-medium text-primary">{job.company}</p>
                        <p className="text-xs text-muted-foreground">
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
          </ScrollReveal>

          {/* Technical Skills */}
          <ScrollReveal>
            <Card id="skills" className="scroll-mt-24 border-border/80">
              <CardHeader>
                <CardTitle className="flex items-center gap-2.5 text-2xl">
                  <Award className="h-6 w-6 text-primary" />
                  Technical &amp; Operational Arsenal
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {Object.entries(technicalSkills).map(([category, skills]) => (
                  <div key={category}>
                    <h3 className="mb-2.5 font-mono text-xs font-semibold tracking-wider text-primary uppercase">
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

                <div className="grid gap-6 border-t border-border/60 pt-4 sm:grid-cols-2">
                  <div>
                    <h3 className="mb-2.5 font-mono text-xs font-semibold tracking-wider text-primary uppercase">
                      Leadership &amp; Soft Skills
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {softSkills.map((skill) => (
                        <Badge key={skill} variant="outline" className="px-3 py-1 text-xs">
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="mb-2.5 font-mono text-xs font-semibold tracking-wider text-primary uppercase">
                      Operational Capabilities
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {otherSkills.map((skill) => (
                        <Badge key={skill} variant="outline" className="px-3 py-1 text-xs">
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </ScrollReveal>

          {/* Professional Certificates & Course Completions */}
          <ScrollReveal>
            <Card className="border-border/80">
              <CardHeader>
                <CardTitle className="flex items-center gap-2.5 text-2xl">
                  <Award className="h-6 w-6 text-primary" />
                  Specialized Training &amp; Course Completions
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {professionalCertificates.map((cert, index) => (
                  <div
                    key={index}
                    className="rounded-xl border border-border/80 bg-card/60 p-4 transition-colors hover:border-primary/40"
                  >
                    {cert.verificationUrl ? (
                      <Link
                        href={cert.verificationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group inline-flex items-start gap-1.5 font-semibold hover:text-primary"
                      >
                        <span className="text-sm">{cert.name}</span>
                        <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60 group-hover:opacity-100" />
                      </Link>
                    ) : (
                      <h3 className="text-sm font-semibold">{cert.name}</h3>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">{cert.issuer}</p>
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                      {cert.date}
                    </p>
                  </div>
                ))}
                <div className="col-span-full rounded-xl border border-primary/25 bg-primary/5 p-4">
                  <Link
                    href="https://drive.google.com/drive/folders/1JZvV08biy77fcW0_R9BJQEvBZuPH4ZVj?usp=sharing"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
                  >
                    <ExternalLink className="h-4 w-4" />
                    <span>Browse Full Verification Archive of Course Certificates</span>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </ScrollReveal>

          {/* Education & Leadership */}
          <div className="grid gap-6 lg:grid-cols-12">
            <ScrollReveal className="lg:col-span-5">
              <Card id="education" className="h-full scroll-mt-24 border-border/80">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2.5 text-xl">
                    <GraduationCap className="h-5 w-5 text-primary" />
                    Academic Education
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  {education.map((edu, index) => (
                    <div key={index}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-bold">{edu.degree}</h3>
                          <p className="text-xs font-medium text-primary">{edu.institution}</p>
                          <p className="text-xs text-muted-foreground">{edu.location}</p>
                        </div>
                        <Badge variant="outline" className="font-mono text-[11px]">
                          {edu.period}
                        </Badge>
                      </div>
                      {index < education.length - 1 && <Separator className="mt-4" />}
                    </div>
                  ))}

                  <Separator className="my-4" />
                  <div>
                    <h4 className="mb-2.5 flex items-center gap-1.5 font-mono text-xs font-semibold text-primary uppercase">
                      <Globe className="h-3.5 w-3.5" />
                      Languages
                    </h4>
                    <div className="grid grid-cols-2 gap-2.5 text-xs">
                      <div className="flex items-center justify-between rounded-lg border border-border/70 p-2.5">
                        <span className="font-medium">Bengali</span>
                        <Badge variant="secondary" className="text-[10px]">
                          Native
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-border/70 p-2.5">
                        <span className="font-medium">English</span>
                        <Badge variant="secondary" className="text-[10px]">
                          Fluent
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </ScrollReveal>

            <ScrollReveal className="lg:col-span-7">
              <Card id="leadership" className="h-full scroll-mt-24 border-border/80">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2.5 text-xl">
                    <Users className="h-5 w-5 text-primary" />
                    Leadership &amp; Research Lab Fellowship
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  {leadership.map((role, index) => (
                    <div key={index}>
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 className="text-base font-bold">{role.title}</h3>
                          <p className="text-xs font-medium text-primary">{role.organization}</p>
                        </div>
                        <Badge variant="outline" className="w-fit font-mono text-[11px]">
                          {role.period}
                        </Badge>
                      </div>
                      {role.highlights && role.highlights.length > 0 && (
                        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                          {role.highlights.map((highlight, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                              <span>{highlight}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {index < leadership.length - 1 && <Separator className="mt-4" />}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </ScrollReveal>
          </div>

          {/* Interests & Community Focus */}
          {hobbies.length > 0 && (
            <ScrollReveal>
              <Card className="border-border/80">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2.5 text-xl">
                    <Heart className="h-5 w-5 text-primary" />
                    Continuous Research &amp; Community Focus
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {hobbies.map((hobby, index) => (
                    <div
                      key={index}
                      className="rounded-xl border border-border/70 bg-card/50 p-4"
                    >
                      <h3 className="text-sm font-semibold">{hobby.name}</h3>
                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                        {hobby.description}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </ScrollReveal>
          )}
        </div>
      </div>
    </div>
  );
}
