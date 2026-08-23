import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Shield, Lock, Eye, Clock, Globe, Mail, AlertCircle, FileText, Users, Server } from "lucide-react"
import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Data & Privacy",
  description: "How your data is collected, used, and protected when you contact Md Redwan Ahmed for cybersecurity services.",
  alternates: { canonical: "/privacy" },
}

export default function Privacy() {
  return (
    <div className="container py-12 px-4 md:px-6">
      <div className="max-w-7xl mx-auto">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 mb-4 px-4 py-2 rounded-full bg-primary/10 text-primary">
            <Shield className="h-4 w-4" />
            <span className="text-sm font-medium">Transparency & Privacy</span>
          </div>
          <h1 className="text-4xl font-bold mb-4">
            Data & <span className="text-primary">Privacy</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            This page explains how I handle the information you share when you contact me through this website. 
            I follow data protection principles inspired by the EU General Data Protection Regulation (GDPR) and 
            good information security practices such as ISO/IEC 27001. In simple terms: I only collect what I need, 
            use it for clear purposes, keep it no longer than necessary, protect it carefully, and respect your rights.
          </p>
          <p className="text-sm text-muted-foreground italic mt-4">
            This page is for transparency and good practice. It is not formal legal advice.
          </p>
        </div>

        {/* Last Updated */}
        <div className="text-center mb-8">
          <p className="text-xs text-muted-foreground">
            Last updated: August 24, 2026
          </p>
        </div>

        {/* Two Column Layout */}
        <div className="grid gap-8 lg:grid-cols-[350px_1fr]">
          {/* Left Sidebar - At a Glance */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <Card className="border-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5 text-primary" />
                  At a Glance
                </CardTitle>
                <CardDescription>Key points about your data</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-1.5 bg-primary rounded-full" />
                  <p className="text-sm text-muted-foreground">
                    I only use your details to review and respond to your request, and to deliver services you ask for.
                  </p>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-1.5 bg-primary rounded-full" />
                  <p className="text-sm text-muted-foreground">
                    I do not sell or rent your personal data.
                  </p>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-1.5 bg-primary rounded-full" />
                  <p className="text-sm text-muted-foreground">
                    I only collect the minimum data needed to understand your enquiry and respond.
                  </p>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-1.5 bg-primary rounded-full" />
                  <p className="text-sm text-muted-foreground">
                    Technical data (like browser information, device information and security logs) is collected to keep the website secure.
                  </p>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-1.5 bg-primary rounded-full" />
                  <p className="text-sm text-muted-foreground">
                    Cloudflare provides DNS, SSL/TLS and security services for this site and may process technical data as part of that.
                  </p>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-1.5 bg-primary rounded-full" />
                  <p className="text-sm text-muted-foreground">
                    You can ask for access, correction or deletion of your data by emailing{" "}
                    <Link href="mailto:contact@redwan.work" className="text-primary hover:underline">
                      contact@redwan.work
                    </Link>
                    .
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Main Content */}
          <div className="space-y-12">
            {/* Section 1: Who We Are */}
            <section>
              <div className="flex items-center gap-3 mb-6">
                <Users className="h-6 w-6 text-primary" />
                <h2 className="text-2xl font-bold">Who We Are & Scope</h2>
              </div>
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <p className="text-muted-foreground leading-relaxed">
                    This website is operated by <strong className="text-foreground">Md Redwan Ahmed</strong>. 
                    References to &quot;I&quot;, &quot;me&quot; or &quot;we&quot; mean Md Redwan Ahmed and any trusted collaborators working 
                    under his direction (for example, when delivering security services).
                  </p>
                  <p className="text-muted-foreground leading-relaxed">
                    This notice covers the website <strong className="text-foreground">redwan.work</strong> and 
                    especially the contact form at{" "}
                    <Link href="/contact" className="text-primary hover:underline">
                      contact
                    </Link>
                    .
                  </p>
                  <div className="mt-6 p-4 rounded-lg bg-primary/5 border border-primary/20">
                    <div className="flex items-start gap-3">
                      <Mail className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <p className="font-medium text-foreground mb-1">Contact for Privacy Matters</p>
                        <p className="text-sm text-muted-foreground">
                          For all data and privacy questions, or to exercise your rights, you can email:{" "}
                          <Link href="mailto:contact@redwan.work" className="text-primary hover:underline font-medium">
                            contact@redwan.work
                          </Link>
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Section 2: What Data We Collect */}
            <section>
              <div className="flex items-center gap-3 mb-6">
                <FileText className="h-6 w-6 text-primary" />
                <h2 className="text-2xl font-bold">What Data We Collect Through the Contact Form</h2>
              </div>
              <Card>
                <CardContent className="pt-6 space-y-6">
                  <p className="text-muted-foreground leading-relaxed">
                    The contact form collects three categories of information: required fields, optional fields, 
                    and technical or auto-generated fields. When you submit the form, your details are sent over 
                    HTTPS to my server and stored in my leads store — a{" "}
                    <strong className="text-foreground">Supabase Postgres database</strong> and/or a{" "}
                    <strong className="text-foreground">private Google Forms spreadsheet</strong>, depending on the 
                    active configuration.
                  </p>

                  <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                      <div>
                        <p className="font-medium text-amber-900 dark:text-amber-100 mb-1">Important Notice</p>
                        <p className="text-sm text-amber-800 dark:text-amber-200">
                          Please do not include sensitive personal information (such as health data, government ID numbers, 
                          or confidential information about third parties) in the free-text fields. If a project genuinely 
                          requires handling such data, we will agree on appropriate safeguards separately.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    {/* Required Fields */}
                    <div>
                      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                        <Badge variant="destructive" className="text-xs">Required</Badge>
                        User-Facing Fields
                      </h3>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Field</TableHead>
                            <TableHead>Purpose</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow>
                            <TableCell className="font-medium">Full Name</TableCell>
                            <TableCell className="text-muted-foreground">To identify who is contacting me</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium">Email</TableCell>
                            <TableCell className="text-muted-foreground">Primary contact method for responses</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium">Country</TableCell>
                            <TableCell className="text-muted-foreground">To understand location and applicable regulations</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium">Time Zone</TableCell>
                            <TableCell className="text-muted-foreground">To coordinate communication timing</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium">Service Type</TableCell>
                            <TableCell className="text-muted-foreground">To understand what services you need</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium">Project Summary</TableCell>
                            <TableCell className="text-muted-foreground">To understand the scope and nature of your enquiry</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium">Urgency</TableCell>
                            <TableCell className="text-muted-foreground">To prioritize responses appropriately</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium">GDPR Consent</TableCell>
                            <TableCell className="text-muted-foreground">Confirmation that you agree to data processing</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>

                    {/* Optional Fields */}
                    <div>
                      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">Optional</Badge>
                        User-Facing Fields
                      </h3>
                      <p className="text-sm text-muted-foreground mb-3">
                        These fields help tailor communication and proposals to your preferences but are not required to submit the form.
                      </p>
                      <div className="grid gap-2 text-sm">
                        {[
                          "WhatsApp Number",
                          "Preferred Contact Method",
                          "Preferred Contact Date",
                          "Best Time to Contact",
                          "Company / Organization",
                          "Project URL or Files",
                          "NDA / Confidentiality",
                          "Budget Range",
                          "How Did You Find Me"
                        ].map((field, i) => (
                          <div key={i} className="flex gap-2 items-start p-2 rounded border bg-card">
                            <div className="w-1.5 h-1.5 bg-primary rounded-full mt-1.5 flex-shrink-0" />
                            <span className="text-muted-foreground">{field}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Hidden/Automatic Fields */}
                    <div>
                      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">Automatic</Badge>
                        Technical & System-Generated Data
                      </h3>
                      <p className="text-sm text-muted-foreground mb-3">
                        These fields are collected automatically to keep the service secure, prioritize work, and help with troubleshooting if needed.
                      </p>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Field</TableHead>
                            <TableHead>Purpose</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow>
                            <TableCell className="font-medium">Ticket ID</TableCell>
                            <TableCell className="text-muted-foreground">A reference number used to track your enquiry</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium">Source Page</TableCell>
                            <TableCell className="text-muted-foreground">URL path where the form was submitted</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium">User Agent</TableCell>
                            <TableCell className="text-muted-foreground">Browser and OS info for troubleshooting</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium">Device Type</TableCell>
                            <TableCell className="text-muted-foreground">Desktop/Mobile/Tablet classification</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium">Priority</TableCell>
                            <TableCell className="text-muted-foreground">Auto-derived from urgency</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium">Timestamp</TableCell>
                            <TableCell className="text-muted-foreground">Date and time of submission</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium">Security Signals</TableCell>
                            <TableCell className="text-muted-foreground">Bot detection (validated, not stored)</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Section 3: Why We Collect & Legal Bases */}
            <section>
              <div className="flex items-center gap-3 mb-6">
                <FileText className="h-6 w-6 text-primary" />
                <h2 className="text-2xl font-bold">Why We Collect This Data & Our Legal Bases</h2>
              </div>
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <p className="text-muted-foreground leading-relaxed">
                    I follow GDPR principles including lawfulness, fairness and transparency, purpose limitation, 
                    data minimisation, and storage limitation. Data is processed only for the specific purposes 
                    described on this page.
                  </p>
                  <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                    <h3 className="font-semibold text-foreground mb-3">Legal Bases for Processing</h3>
                    <div className="space-y-3">
                      <div className="flex gap-3">
                        <div className="flex-shrink-0 w-1.5 bg-primary rounded-full mt-1.5" />
                        <div>
                          <p className="font-medium text-foreground">Consent</p>
                          <p className="text-sm text-muted-foreground">
                            When you tick the &quot;I agree…&quot; checkbox on the contact form, you confirm that you have 
                            read this page and allow processing of your details for the purposes described.
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <div className="flex-shrink-0 w-1.5 bg-primary rounded-full mt-1.5" />
                        <div>
                          <p className="font-medium text-foreground">Legitimate Interest & Pre-Contractual Steps</p>
                          <p className="text-sm text-muted-foreground">
                            There is a reasonable expectation that if someone asks about security services, their 
                            details will be used to respond, provide a quote, or prepare an agreement.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                    <div className="flex items-start gap-3">
                      <Shield className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
                      <div>
                        <p className="font-medium text-green-900 dark:text-green-100 mb-1">What We Don&apos;t Do</p>
                        <ul className="text-sm text-green-800 dark:text-green-200 space-y-1 list-disc list-inside">
                          <li>Data is not used to build marketing profiles</li>
                          <li>Data is not used for unrelated advertising</li>
                          <li>Data is not sold to data brokers or third parties</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Section 4: How We Use Your Data */}
            <section>
              <div className="flex items-center gap-3 mb-6">
                <Server className="h-6 w-6 text-primary" />
                <h2 className="text-2xl font-bold">How We Use Your Data</h2>
              </div>
              <Card>
                <CardContent className="pt-6">
                  <ul className="space-y-3">
                    {[
                      "To read and respond to your enquiry",
                      "To prepare proposals, statements of work, or contracts if you decide to move forward",
                      "To manage and follow up on ongoing projects or support tickets",
                      "To manage records required by law (for example, tax and accounting records if a project goes ahead)",
                      "To protect the website and services from abuse, fraud, and security threats (including via IP-based rate limiting, security logs and anti-bot checks)",
                      "To improve how the site and contact process work (for example, by understanding which services are most requested)",
                    ].map((item, index) => (
                      <li key={index} className="flex gap-3">
                        <div className="flex-shrink-0 w-1.5 bg-primary rounded-full mt-2" />
                        <p className="text-muted-foreground leading-relaxed">{item}</p>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </section>

            {/* Section 5: Data Retention */}
            <section>
              <div className="flex items-center gap-3 mb-6">
                <Clock className="h-6 w-6 text-primary" />
                <h2 className="text-2xl font-bold">How Long We Keep Your Data</h2>
              </div>
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <p className="text-muted-foreground leading-relaxed">
                    Data retention periods are based on ISO 27001-style practices and legal requirements:
                  </p>
                  <div className="space-y-4">
                    <div className="p-4 rounded-lg border bg-card">
                      <h3 className="font-semibold text-foreground mb-2">Contact Form Enquiries (No Contract)</h3>
                      <p className="text-sm text-muted-foreground">
                        Lead records submitted through the contact form are deleted after up to{" "}
                        <strong className="text-foreground">24 months</strong> of inactivity (measured from the last meaningful 
                        interaction), then securely deleted or anonymised.
                      </p>
                    </div>
                    <div className="p-4 rounded-lg border bg-card">
                      <h3 className="font-semibold text-foreground mb-2">Client Projects & Contracts</h3>
                      <p className="text-sm text-muted-foreground">
                        Relevant contact form data is kept as part of project and accounting records, typically for 
                        up to <strong className="text-foreground">7 years</strong> to meet legal and tax obligations.
                      </p>
                    </div>
                    <div className="p-4 rounded-lg border bg-card">
                      <h3 className="font-semibold text-foreground mb-2">Technical & Security Logs</h3>
                      <p className="text-sm text-muted-foreground">
                        Including server and security logs, typically kept for up to <strong className="text-foreground">12 months</strong>, 
                        unless they need to be kept longer for investigating security incidents, fraud, or legal disputes. 
                        For abuse prevention, IP addresses are stored only as <strong className="text-foreground">salted one-way hashes</strong> — 
                        raw IP addresses are never persisted.
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground italic">
                    These time periods may be adjusted if required by law. Data is reviewed periodically to ensure 
                    it is still necessary.
                  </p>
                </CardContent>
              </Card>
            </section>

            {/* Section 6: Where Data is Processed */}
            <section>
              <div className="flex items-center gap-3 mb-6">
                <Globe className="h-6 w-6 text-primary" />
                <h2 className="text-2xl font-bold">Where Data is Processed & Who We Share It With</h2>
              </div>
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <p className="text-muted-foreground leading-relaxed">
                    The main data controller is <strong className="text-foreground">Md Redwan Ahmed</strong>. 
                    Personal data is stored and processed using secure cloud services located in reputable regions 
                    (for example, the EU/EEA, UK, or other locations with adequate safeguards).
                  </p>
                  <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                    <p className="text-muted-foreground leading-relaxed">
                      I use secure cloud productivity and storage tools to manage contact form submissions, email and 
                      project records. These providers are selected based on their security posture and data protection 
                      commitments.
                    </p>
                  </div>
                  <h3 className="font-semibold text-foreground pt-2">Categories of Recipients</h3>
                  <ul className="space-y-3">
                    {[
                      "Cloud hosting and infrastructure providers (for running the website and sending email)",
                      "Security and performance providers (such as the content delivery network and DDoS protection service)",
                      "Professional advisors (for example, accountants or legal advisors) where necessary",
                    ].map((item, index) => (
                      <li key={index} className="flex gap-3">
                        <div className="flex-shrink-0 w-1.5 bg-primary rounded-full mt-2" />
                        <p className="text-muted-foreground leading-relaxed">{item}</p>
                      </li>
                    ))}
                  </ul>
                  <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 mt-4">
                    <div className="flex items-start gap-3">
                      <Shield className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
                      <div>
                        <p className="font-medium text-green-900 dark:text-green-100 mb-1">Data Sharing Policy</p>
                        <ul className="text-sm text-green-800 dark:text-green-200 space-y-1 list-disc list-inside">
                          <li>Data is not sold or rented</li>
                          <li>Data is only shared when necessary to provide the service, comply with the law, or protect rights and security</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Section 7: Security Measures */}
            <section>
              <div className="flex items-center gap-3 mb-6">
                <Lock className="h-6 w-6 text-primary" />
                <h2 className="text-2xl font-bold">Security Measures</h2>
              </div>
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <p className="text-muted-foreground leading-relaxed">
                    I implement technical and organisational measures inspired by ISO/IEC 27001 standards to protect 
                    your data. While no system can guarantee absolute security, reasonable and proportionate controls 
                    are in place.
                  </p>
                  <h3 className="font-semibold text-foreground pt-2">Security Controls</h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    {[
                      { title: "Encryption in Transit", desc: "HTTPS/TLS for all traffic between your browser and the site" },
                      { title: "Access Control", desc: "Restricted to Md Redwan Ahmed and trusted collaborators under confidentiality obligations" },
                      { title: "Authentication", desc: "Strong authentication, unique accounts, and least-privilege access principles" },
                      { title: "Monitoring & Logging", desc: "Security monitoring and logging of access and changes" },
                      { title: "Trusted Infrastructure", desc: "Use of reputable cloud providers with their own security certifications" },
                      { title: "Regular Updates", desc: "Regular patching and hardening of software where reasonably possible" },
                    ].map((item, index) => (
                      <div key={index} className="p-4 rounded-lg border bg-card">
                        <h4 className="font-medium text-foreground mb-1">{item.title}</h4>
                        <p className="text-sm text-muted-foreground">{item.desc}</p>
                      </div>
                    ))}
                  </div>
                  <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 mt-4">
                    <h4 className="font-semibold text-foreground mb-2">Incident Response</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      In the event of a security incident, I follow a structured process: detect, contain, investigate, 
                      notify where required by law or good practice, and implement improvements to prevent recurrence.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Section 8: Your Rights */}
            <section>
              <div className="flex items-center gap-3 mb-6">
                <Shield className="h-6 w-6 text-primary" />
                <h2 className="text-2xl font-bold">Your Rights</h2>
              </div>
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <p className="text-muted-foreground leading-relaxed">
                    Based on GDPR-style rights, you have the following data protection rights:
                  </p>
                  <div className="space-y-3">
                    {[
                      { title: "Access", desc: "Request a copy of your data" },
                      { title: "Rectification", desc: "Ask for corrections to inaccurate data" },
                      { title: "Erasure", desc: "Ask for deletion where data is no longer needed or where consent is withdrawn" },
                      { title: "Restriction", desc: "Ask to restrict or object to certain processing" },
                      { title: "Portability", desc: "Ask for data to be provided in a portable format where technically feasible" },
                    ].map((item, index) => (
                      <div key={index} className="flex gap-3">
                        <div className="flex-shrink-0 w-1.5 bg-primary rounded-full mt-2" />
                        <div>
                          <p className="font-medium text-foreground">{item.title}</p>
                          <p className="text-sm text-muted-foreground">{item.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground italic">
                    These rights may be subject to certain legal limitations (for example, where records must be kept 
                    for tax or regulatory reasons).
                  </p>
                  <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 mt-4">
                    <div className="flex items-start gap-3">
                      <Mail className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <p className="font-medium text-foreground mb-2">How to Exercise Your Rights</p>
                        <p className="text-sm text-muted-foreground">
                          To exercise any of these rights, please email{" "}
                          <Link href="mailto:contact@redwan.work" className="text-primary hover:underline font-medium">
                            contact@redwan.work
                          </Link>
                          {" "}from the address you used in the contact form and describe your request. 
                          I will respond as soon as reasonably possible.
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Section 9: Cookies & Cloudflare */}
            <section>
              <div className="flex items-center gap-3 mb-6">
                <Globe className="h-6 w-6 text-primary" />
                <h2 className="text-2xl font-bold">Cookies, Technical Data & Cloudflare</h2>
              </div>
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <p className="text-muted-foreground leading-relaxed">
                    This site uses strictly necessary cookies and similar technologies for security and performance. 
                    These are essential for the site to function and are not used for advertising or tracking your 
                    browsing on other websites.
                  </p>
                  <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                    <h3 className="font-semibold text-foreground mb-2">Cloudflare Services</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                      <strong className="text-foreground">Cloudflare</strong>, acting as DNS, CDN, and security provider, 
                      may collect technical data such as IP address, request details, system configuration, and cookies 
                      to defend against attacks and ensure reliable delivery.
                    </p>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      These cookies and logs are used only for security and service delivery, not for advertising.
                    </p>
                  </div>
                  <h3 className="font-semibold text-foreground pt-2">Technical Data Collected</h3>
                  <div className="grid gap-2 md:grid-cols-2">
                    {[
                      "IP address",
                      "Browser type and version",
                      "Operating system",
                      "Referrer URL",
                      "Date/time of access",
                      "Security events (e.g., blocked requests, challenge results)",
                    ].map((item, index) => (
                      <div key={index} className="flex gap-2 items-center">
                        <div className="w-1.5 h-1.5 bg-primary rounded-full" />
                        <p className="text-sm text-muted-foreground">{item}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-6 p-4 rounded-lg border bg-card">
                    <h4 className="font-medium text-foreground mb-3">Learn More About Cloudflare</h4>
                    <div className="space-y-2 text-sm">
                      <p>
                        <Link 
                          href="https://www.cloudflare.com/privacypolicy/" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          Cloudflare Privacy Policy
                        </Link>
                        {" "}- General infrastructure services
                      </p>
                      <p>
                        <Link 
                          href="https://www.cloudflare.com/cookie-policy/" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          Cloudflare Cookie Policy
                        </Link>
                        {" "}- Information about cookies used
                      </p>
                      <p>
                        <Link 
                          href="https://www.cloudflare.com/privacypolicy/#turnstile" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          Cloudflare Turnstile Privacy Notice
                        </Link>
                        {" "}- Bot protection details
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">
                      You are encouraged to review these documents for details of how Cloudflare processes data 
                      in its role as service provider.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Section 10: Cloudflare Turnstile */}
            <section>
              <div className="flex items-center gap-3 mb-6">
                <Shield className="h-6 w-6 text-primary" />
                <h2 className="text-2xl font-bold">Cloudflare Turnstile (Bot Protection)</h2>
              </div>
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <p className="text-muted-foreground leading-relaxed">
                    The contact form uses <strong className="text-foreground">Cloudflare Turnstile</strong> to protect 
                    against automated abuse and spam. This helps ensure that genuine enquiries are prioritized.
                  </p>
                  <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                    <h3 className="font-semibold text-foreground mb-2">How Turnstile Works</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                      Turnstile collects and processes certain client-side signals (for example, IP address, User Agent, 
                      and related technical fingerprints) to determine whether a request is legitimate. According to 
                      Cloudflare, this is done in a privacy-preserving way and is not used for ad targeting.
                    </p>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      In most cases, Turnstile runs in the background with no user interaction required. Occasionally, 
                      a simple verification check may be shown.
                    </p>
                  </div>
                  <div className="mt-4">
                    <p className="text-sm text-muted-foreground">
                      For more details, see{" "}
                      <Link 
                        href="https://www.cloudflare.com/privacypolicy/#turnstile" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        Cloudflare&apos;s Turnstile privacy page
                      </Link>
                      .
                    </p>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Section 11: Law Enforcement */}
            <section>
              <div className="flex items-center gap-3 mb-6">
                <AlertCircle className="h-6 w-6 text-primary" />
                <h2 className="text-2xl font-bold">Law Enforcement, Audits & Legal Obligations</h2>
              </div>
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <p className="text-muted-foreground leading-relaxed">
                    Data may be disclosed to law enforcement or regulators if there is a legal obligation to do so 
                    (for example, a valid court order or binding request from a regulatory authority).
                  </p>
                  <div className="space-y-3">
                    {[
                      "Each request will be checked to ensure it is lawful, necessary and proportionate",
                      "Only the minimum amount of data necessary will be shared",
                      "Where legally permitted, the affected individual will be informed",
                    ].map((item, index) => (
                      <div key={index} className="flex gap-3">
                        <div className="flex-shrink-0 w-1.5 bg-primary rounded-full mt-2" />
                        <p className="text-muted-foreground leading-relaxed">{item}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground italic mt-4">
                    In the context of security audits or compliance assessments, only strictly necessary information 
                    will be shared with auditors under appropriate confidentiality obligations.
                  </p>
                </CardContent>
              </Card>
            </section>

            {/* Section 12: Updates */}
            <section>
              <div className="flex items-center gap-3 mb-6">
                <FileText className="h-6 w-6 text-primary" />
                <h2 className="text-2xl font-bold">Updates to This Page</h2>
              </div>
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <p className="text-muted-foreground leading-relaxed">
                    This Data & Privacy page may be updated if the site or processing activities change. The most 
                    recent version will always be available at{" "}
                    <Link href="/privacy" className="text-primary hover:underline">
                      privacy
                    </Link>
                    .
                  </p>
                  <p className="text-muted-foreground leading-relaxed">
                    If significant changes are made, I will take reasonable steps to notify users who have recently 
                    submitted contact forms. Continued use of the site after changes indicates acceptance of the 
                    updated policy.
                  </p>
                  <div className="mt-6 p-4 rounded-lg bg-primary/5 border border-primary/20">
                    <div className="flex items-start gap-3">
                      <Mail className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <p className="font-medium text-foreground mb-1">Questions About This Policy?</p>
                        <p className="text-sm text-muted-foreground">
                          If you have any questions about this privacy notice or how your data is handled, 
                          please email{" "}
                          <Link href="mailto:contact@redwan.work" className="text-primary hover:underline font-medium">
                            contact@redwan.work
                          </Link>
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
