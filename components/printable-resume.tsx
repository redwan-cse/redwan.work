import React from "react"

interface PrintableResumeProps {
  personalInfo: {
    name: string
    title: string
    subtitle: string
    email: string
    phone: string
    location: string
    linkedin: string
    github: string
    website: string
  }
  summary?: string
  researchInterests?: string[]
  technicalSkills: Record<string, string[]>
  softSkills: string[]
  otherSkills: string[]
  experience: Array<{
    title: string
    company: string
    type: string
    location: string
    period: string
    highlights?: string[]
  }>
  education: Array<{
    degree: string
    institution: string
    location: string
    period: string
  }>
  certifications: Array<{
    name: string
    issuer: string
    date: string
  }>
  research: {
    journal: {
      title: string
      details: string[]
    }
    conference: {
      title: string
      details: string[]
    }
  }
  leadership: Array<{
    title: string
    organization: string
    period: string
    description?: string
  }>
  hobbies: Array<{
    name: string
    description: string
  }>
  references?: Array<{
    name: string
    title: string
    institution: string
    email: string
    phone: string
  }>
}

export const PrintableResume = React.forwardRef<HTMLDivElement, PrintableResumeProps>(
  (props, ref) => {
    const {
      personalInfo,
      summary,
      researchInterests,
      technicalSkills,
      softSkills,
      otherSkills,
      experience,
      education,
      certifications,
      research,
      leadership,
      hobbies,
      references,
    } = props

    return (
      <div ref={ref} className="print-resume">
        <style jsx global>{`
          @import url('https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400;600;700&family=Inter:wght@300;400;500;600;700&display=swap');
          
          @page {
            size: A4;
            margin: 0.6in 0.7in;
          }
          
          @media print {
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              color-adjust: exact !important;
            }
            
            body {
              margin: 0;
              padding: 0;
            }
            
            .print-resume {
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              font-size: 9.5pt;
              line-height: 1.5;
              color: #1a1a1a;
              background: #ffffff;
              max-width: 100%;
              margin: 0;
              padding: 0;
            }
            
            /* Typography Hierarchy */
            .print-resume .resume-name {
              font-family: 'Crimson Pro', Georgia, serif;
              font-size: 28pt;
              font-weight: 700;
              letter-spacing: -0.3pt;
              color: #0f172a;
              margin: 0 0 3pt 0;
              line-height: 1.1;
            }
            
            .print-resume .resume-title {
              font-family: 'Inter', sans-serif;
              font-size: 12pt;
              font-weight: 600;
              color: #2563eb;
              margin: 0 0 2pt 0;
              letter-spacing: 0.2pt;
              text-transform: uppercase;
            }
            
            .print-resume .resume-subtitle {
              font-size: 9.5pt;
              color: #475569;
              margin: 0 0 5pt 0;
              font-weight: 400;
            }
            
            .print-resume .contact-info {
              font-size: 9pt;
              color: #64748b;
              margin-bottom: 6pt;
              line-height: 1.4;
              display: flex;
              flex-wrap: wrap;
              gap: 5pt 9pt;
              align-items: center;
            }
            
            .print-resume .contact-item {
              display: flex;
              align-items: center;
              gap: 4pt;
              color: #64748b;
            }
            
            .print-resume .contact-icon {
              width: 12pt;
              height: 12pt;
              color: #2563eb;
              flex-shrink: 0;
            }
            
            /* Section Headers */
            .print-resume .section-header {
              font-family: 'Crimson Pro', Georgia, serif;
              font-size: 12pt;
              font-weight: 700;
              color: #0f172a;
              margin: 9pt 0 5pt 0;
              padding-bottom: 2.5pt;
              border-bottom: 1.5pt solid #2563eb;
              letter-spacing: 0.2pt;
              display: flex;
              align-items: center;
              page-break-after: avoid;
              page-break-before: auto;
            }
            
            .print-resume .section-header::before {
              content: '';
              display: inline-block;
              width: 3pt;
              height: 12pt;
              background: #2563eb;
              margin-right: 6pt;
              border-radius: 1pt;
            }
            
            /* Experience Items */
            .print-resume .experience-item {
              margin-bottom: 7pt;
              page-break-inside: avoid;
            }
            
            .print-resume .experience-header {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              margin-bottom: 2pt;
              gap: 8pt;
            }
            
            .print-resume .job-title {
              font-size: 10.5pt;
              font-weight: 600;
              color: #0f172a;
              margin: 0;
              flex: 1;
            }
            
            .print-resume .date-range {
              font-size: 9pt;
              color: #64748b;
              font-weight: 500;
              white-space: nowrap;
              text-align: right;
              padding: 2pt 6pt;
              background: #f1f5f9;
              border-radius: 3pt;
            }
            
            .print-resume .company-info {
              font-size: 9.5pt;
              color: #2563eb;
              font-weight: 500;
              margin: 0 0 1pt 0;
            }
            
            .print-resume .job-meta {
              font-size: 8.5pt;
              color: #64748b;
              margin: 0 0 3pt 0;
              display: flex;
              align-items: center;
              gap: 4pt;
            }
            
            .print-resume .meta-icon {
              width: 10pt;
              height: 10pt;
              color: #94a3b8;
            }
            
            /* Lists */
            .print-resume ul {
              margin: 3pt 0 0 14pt;
              padding: 0;
              list-style: none;
            }
            
            .print-resume ul li {
              position: relative;
              padding-left: 10pt;
              margin-bottom: 2pt;
              font-size: 9pt;
              color: #334155;
              line-height: 1.5;
            }
            
            .print-resume ul li::before {
              content: '▸';
              position: absolute;
              left: 0;
              color: #2563eb;
              font-size: 7pt;
            }
            
            /* Skills */
            .print-resume .skill-category {
              margin-bottom: 5pt;
            }
            
            .print-resume .skill-category-name {
              font-size: 9.5pt;
              font-weight: 600;
              color: #0f172a;
              margin-bottom: 2.5pt;
            }
            
            .print-resume .skill-tag {
              display: inline-block;
              padding: 2pt 6pt;
              margin: 0 3pt 3pt 0;
              background: #f1f5f9;
              border: 0.5pt solid #cbd5e1;
              border-radius: 3pt;
              font-size: 8pt;
              color: #334155;
              font-weight: 500;
            }
            
            /* Certifications Grid */
            .print-resume .cert-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 5pt;
              margin-top: 4pt;
            }
            
            .print-resume .cert-item {
              padding: 4pt 6pt;
              background: #f8fafc;
              border-left: 2pt solid #2563eb;
              border-radius: 2pt;
              page-break-inside: avoid;
            }
            
            .print-resume .cert-name {
              font-size: 9pt;
              font-weight: 600;
              color: #0f172a;
              margin-bottom: 1pt;
              line-height: 1.3;
            }
            
            .print-resume .cert-issuer {
              font-size: 8pt;
              color: #64748b;
            }
            
            .print-resume .cert-date {
              font-size: 7.5pt;
              color: #94a3b8;
              font-style: italic;
              margin-top: 1pt;
            }
            
            /* Research */
            .print-resume .research-item {
              margin-bottom: 6pt;
              padding: 6pt;
              background: #f8fafc;
              border-radius: 3pt;
              border-left: 2pt solid #2563eb;
              page-break-inside: avoid;
            }
            
            .print-resume .research-badge {
              display: inline-block;
              padding: 1pt 5pt;
              background: #2563eb;
              color: white;
              font-size: 7pt;
              font-weight: 600;
              border-radius: 2pt;
              margin-right: 3pt;
              text-transform: uppercase;
              letter-spacing: 0.3pt;
            }
            
            .print-resume .research-title {
              font-size: 9.5pt;
              font-weight: 600;
              color: #0f172a;
              margin: 3pt 0 2pt 0;
              line-height: 1.4;
            }
            
            /* Separators */
            .print-resume .divider {
              border: 0;
              border-top: 0.5pt solid #e2e8f0;
              margin: 6pt 0;
            }
            
            /* Utilities */
            .print-resume .text-muted {
              color: #64748b;
            }
            
            .print-resume .font-medium {
              font-weight: 500;
            }
            
            .print-resume .font-semibold {
              font-weight: 600;
            }
            
            /* Page Breaks */
            .print-resume .section {
              page-break-inside: auto;
            }
            
            .print-resume .avoid-break {
              page-break-inside: avoid;
            }
            
            /* Hide in print */
            .print-hide {
              display: none !important;
            }
            
            /* Two-column layout for compact sections */
            .print-resume .two-col {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 8pt;
            }
            
            /* Languages */
            .print-resume .lang-item {
              display: flex;
              justify-content: space-between;
              padding: 3pt 6pt;
              background: #f8fafc;
              border-radius: 2pt;
              margin-bottom: 3pt;
            }
            
            .print-resume .lang-name {
              font-weight: 600;
              color: #0f172a;
              font-size: 9pt;
            }
            
            .print-resume .lang-level {
              color: #2563eb;
              font-weight: 500;
              font-size: 8.5pt;
            }
          }
          
          /* Screen preview styles */
          @media screen {
            .print-resume {
              font-family: 'Inter', sans-serif;
              max-width: 210mm;
              min-height: 297mm;
              margin: 0 auto;
              padding: 0.75in;
              background: white;
              box-shadow: 0 0 10px rgba(0,0,0,0.1);
            }
          }
        `}</style>

        {/* Header */}
        <div style={{ marginBottom: '8pt' }}>
          <h1 className="resume-name">{personalInfo.name}</h1>
          <div className="resume-title">{personalInfo.title}</div>
          <div className="resume-subtitle">{personalInfo.subtitle}</div>
          
          <div className="contact-info">
            <div className="contact-item">
              <svg className="contact-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="20" height="16" x="2" y="4" rx="2"/>
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
              </svg>
              <span>{personalInfo.email}</span>
            </div>
            <div className="contact-item">
              <svg className="contact-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              <span>{personalInfo.phone}</span>
            </div>
            <div className="contact-item">
              <svg className="contact-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/>
                <rect width="4" height="12" x="2" y="9"/>
                <circle cx="4" cy="4" r="2"/>
              </svg>
              <span>{personalInfo.linkedin.replace('https://www.linkedin.com/in/', '')}</span>
            </div>
            <div className="contact-item">
              <svg className="contact-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/>
                <path d="M9 18c-4.51 2-5-2-7-2"/>
              </svg>
              <span>{personalInfo.github.replace('https://github.com/', '')}</span>
            </div>
            <div className="contact-item">
              <svg className="contact-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>
                <path d="M2 12h20"/>
              </svg>
              <span>{personalInfo.website.replace('https://', '').replace('http://', '')}</span>
            </div>
          </div>
        </div>

        <div className="divider" />

        {/* Summary Section */}
        {summary && (
          <>
            <div>
              <h2 className="section-header">Summary</h2>
              <p style={{ fontSize: '9pt', color: '#334155', lineHeight: '1.5', textAlign: 'justify', margin: '0' }}>
                {summary}
              </p>
            </div>
            <div className="divider" />
          </>
        )}

        {/* Research Interests */}
        {researchInterests && researchInterests.length > 0 && (
          <>
            <div>
              <h2 className="section-header">Research Interests</h2>
              <div>
                {researchInterests.map((interest) => (
                  <span key={interest} className="skill-tag" style={{ marginRight: '4pt' }}>
                    {interest}
                  </span>
                ))}
              </div>
            </div>
            <div className="divider" />
          </>
        )}

        {/* Professional Experience */}
        <div className="section">
          <h2 className="section-header">Professional Experience</h2>
          {experience.map((job, index) => (
            <div key={index} className="experience-item">
              <div className="experience-header">
                <div className="job-title">{job.title}</div>
                <div className="date-range">{job.period}</div>
              </div>
              <div className="company-info">{job.company}</div>
              <div className="job-meta">
                <svg className="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="20" height="14" x="2" y="7" rx="2" ry="2"/>
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
                </svg>
                <span>{job.type}</span>
                <span style={{ margin: '0 2pt' }}>•</span>
                <svg className="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
                <span>{job.location}</span>
              </div>
              {job.highlights && (
                <ul>
                  {job.highlights.map((highlight, i) => (
                    <li key={i}>{highlight}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>

        {/* Education */}
        <div className="section">
          <h2 className="section-header">Education</h2>
          {education.map((edu, index) => (
            <div key={index} className="experience-item">
              <div className="experience-header">
                <div className="job-title">{edu.degree}</div>
                <div className="date-range">{edu.period}</div>
              </div>
              <div className="company-info">{edu.institution}</div>
              <div className="job-meta">
                <svg className="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
                <span>{edu.location}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Technical Skills */}
        <div className="section">
          <h2 className="section-header">Technical Skills</h2>
          {Object.entries(technicalSkills).map(([category, skills]) => (
            <div key={category} className="skill-category">
              <div className="skill-category-name">{category}</div>
              <div>
                {skills.map((skill) => (
                  <span key={skill} className="skill-tag">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Certifications */}
        <div className="section">
          <h2 className="section-header">Certifications</h2>
          <div className="cert-grid">
            {certifications.map((cert, index) => (
              <div key={index} className="cert-item avoid-break">
                <div className="cert-name">{cert.name}</div>
                <div className="cert-issuer">{cert.issuer}</div>
                <div className="cert-date">{cert.date}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Research & Publications */}
        <div className="section">
          <h2 className="section-header">Research & Publications</h2>
          <div className="research-item avoid-break">
            <div>
              <span className="research-badge">Journal</span>
              <span className="research-badge" style={{ background: '#059669' }}>Q1</span>
              <span className="research-badge" style={{ background: '#7c3aed' }}>Scopus</span>
            </div>
            <div className="research-title">{research.journal.title}</div>
            <ul style={{ marginTop: '4pt' }}>
              {research.journal.details.map((detail, index) => (
                <li key={index}>{detail}</li>
              ))}
            </ul>
          </div>
          
          <div className="research-item avoid-break">
            <div>
              <span className="research-badge">Conference</span>
              <span className="research-badge" style={{ background: '#dc2626' }}>IEEE</span>
            </div>
            <div className="research-title">{research.conference.title}</div>
            <ul style={{ marginTop: '4pt' }}>
              {research.conference.details.map((detail, index) => (
                <li key={index}>{detail}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* Leadership Experience */}
        <div className="section">
          <h2 className="section-header">Leadership Experience</h2>
          {leadership.map((role, index) => (
            <div key={index} className="experience-item">
              <div className="experience-header">
                <div className="job-title">{role.title}</div>
                <div className="date-range">{role.period}</div>
              </div>
              <div className="company-info">{role.organization}</div>
              {role.description && (
                <div className="job-meta">{role.description}</div>
              )}
            </div>
          ))}
        </div>

        {/* Additional Skills & Languages */}
        <div className="section">
          <h2 className="section-header">Additional Skills</h2>
          
          <div className="two-col">
            <div>
              <div className="skill-category-name">Soft Skills</div>
              <div>
                {softSkills.map((skill) => (
                  <span key={skill} className="skill-tag">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
            
            <div>
              <div className="skill-category-name">Other Skills</div>
              <div>
                {otherSkills.map((skill) => (
                  <span key={skill} className="skill-tag">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Languages */}
        <div className="section">
          <h2 className="section-header">Languages</h2>
          <div className="two-col">
            <div className="lang-item">
              <span className="lang-name">Bengali</span>
              <span className="lang-level">Native</span>
            </div>
            <div className="lang-item">
              <span className="lang-name">English</span>
              <span className="lang-level">Fluent</span>
            </div>
          </div>
        </div>

        {/* Hobbies & Interests */}
        <div className="section">
          <h2 className="section-header">Hobbies & Interests</h2>
          <div className="two-col" style={{ gap: '8pt' }}>
            {hobbies.map((hobby, index) => (
              <div key={index} style={{ 
                padding: '6pt', 
                background: '#f8fafc', 
                borderRadius: '3pt',
                borderLeft: '2pt solid #e2e8f0',
                pageBreakInside: 'avoid'
              }}>
                <div style={{ 
                  fontSize: '9pt', 
                  fontWeight: '600', 
                  color: '#0f172a',
                  marginBottom: '2pt'
                }}>
                  {hobby.name}
                </div>
                <div style={{ 
                  fontSize: '8pt', 
                  color: '#64748b',
                  lineHeight: '1.4'
                }}>
                  {hobby.description}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* References */}
        {references && references.length > 0 && (
          <div className="section">
            <h2 className="section-header">References</h2>
            <div className="two-col" style={{ gap: '8pt' }}>
              {references.map((ref, index) => (
                <div key={index} className="avoid-break" style={{
                  padding: '6pt',
                  background: '#f8fafc',
                  borderRadius: '3pt',
                  borderLeft: '2pt solid #2563eb'
                }}>
                  <div style={{
                    fontSize: '9.5pt',
                    fontWeight: '600',
                    color: '#0f172a',
                    marginBottom: '2pt'
                  }}>
                    {ref.name}
                  </div>
                  <div style={{
                    fontSize: '8.5pt',
                    color: '#2563eb',
                    marginBottom: '3pt',
                    lineHeight: '1.3'
                  }}>
                    {ref.title}
                  </div>
                  <div style={{
                    fontSize: '8pt',
                    color: '#64748b',
                    marginBottom: '1pt'
                  }}>
                    {ref.institution}
                  </div>
                  <div style={{
                    fontSize: '8pt',
                    color: '#64748b',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3pt',
                    marginTop: '3pt'
                  }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect width="20" height="16" x="2" y="4" rx="2"/>
                      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                    </svg>
                    <span>{ref.email}</span>
                  </div>
                  <div style={{
                    fontSize: '8pt',
                    color: '#64748b',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3pt',
                    marginTop: '1pt'
                  }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                    </svg>
                    <span>{ref.phone}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }
)

PrintableResume.displayName = "PrintableResume"
