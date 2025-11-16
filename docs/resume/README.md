# Resume System Documentation

Interactive web resume with print-to-PDF functionality, keeping content synchronized between web and PDF versions.

## Overview

- **Page:** `/app/resume/page.tsx`
- **Print Component:** `/components/printable-resume.tsx`
- **PDF Generation:** Browser print dialog (native PDF export)
- **Library:** `react-to-print` for print handling

## System Architecture

### Two Versions, One Source

The resume exists in two formats:
1. **Web Version** - Interactive, styled for screen viewing
2. **PDF Version** - Print-optimized layout with adjusted styling

**Both versions pull from the same data objects** in `/app/resume/page.tsx`:
- `personalInfo`
- `technicalSkills`
- `professionalExperience`
- `education`
- `certifications`
- `researchPublications`
- `references`

### Content Differences

**Web-Only:**
- GitHub link (visible on screen)
- Interactive hover effects
- Color badges
- Navigation header/footer

**PDF-Only:**
- Website URL (`https://redwan.work`)
- Print-optimized spacing
- Black & white friendly
- Page break controls

**Both:**
- Email, phone, location
- LinkedIn profile
- All experience, education, skills
- Certifications and publications

## How to Update Your Resume

### 1. Update Content Data

Edit the data objects at the top of `/app/resume/page.tsx`:

```typescript
const personalInfo = {
  name: "Md. Redwan Ahmed",
  title: "Computer Science & Engineering Professional",
  email: "contact@redwan.work",
  // ... update as needed
}

const professionalExperience = [
  {
    company: "Fast Cyber Defense",
    position: "Founder & CEO",
    duration: "January 2025 – Present",
    description: [
      "Leading cybersecurity consulting firm...",
      // Add/remove bullet points
    ]
  },
  // Add new positions here
]
```

### 2. Update Printable Component

Edit `/components/printable-resume.tsx` and update the corresponding sections:

```typescript
const personalInfo = {
  // Keep in sync with page.tsx
}

const professionalExperience = [
  // Keep in sync with page.tsx
]
```

**Important:** Both files must have identical content (except for web-only/PDF-only fields).

### 3. Test Changes

1. Save both files
2. Run `pnpm dev` and visit `/resume`
3. Click "Download PDF" button
4. Verify content matches in both versions
5. Check page breaks look good in PDF

## Content Guidelines

### Skills Sections

Organized by category for readability:
```typescript
const technicalSkills = {
  "Category Name": [
    "Skill 1",
    "Skill 2",
    // Keep lists concise (5-8 items per category)
  ],
}
```

### Experience Descriptions

Use bullet points for clarity:
- Start with action verbs (e.g., "Led", "Developed", "Implemented")
- Quantify achievements when possible
- Keep descriptions concise (1-2 lines per bullet)
- 3-5 bullets per position

### Education & Certifications

Include:
- Degree/certification name
- Institution
- Year/duration
- Key details (GPA, relevant coursework, etc.)

## Print Styling

### Media Queries

Print-specific styles are in `/components/printable-resume.tsx`:

```css
@media print {
  /* Force A4 page size */
  @page {
    size: A4;
    margin: 10mm;
  }
  
  /* Hide web-only elements */
  .no-print {
    display: none !important;
  }
  
  /* Adjust spacing for print */
  .print-tight {
    margin-bottom: 8px;
  }
}
```

### Page Breaks

Control where pages break:
```css
page-break-before: always;  /* Start new page */
page-break-after: avoid;    /* Keep together */
page-break-inside: avoid;   /* Don't split */
```

## Common Tasks

### Adding a New Job

1. Add to `professionalExperience` array in both files:
   ```typescript
   {
     company: "New Company",
     position: "Your Role",
     duration: "Start – End",
     description: [
       "Achievement 1",
       "Achievement 2",
     ]
   }
   ```

2. Place newest job first (reverse chronological order)

### Adding a Certification

Add to `certifications` array:
```typescript
{
  name: "Certification Name",
  issuer: "Issuing Organization",
  year: "2025",
  credentialId: "Optional ID"
}
```

### Adding a Skill Category

Add new key to `technicalSkills`:
```typescript
const technicalSkills = {
  "Existing Category": [...],
  "New Category": [
    "Skill 1",
    "Skill 2",
  ],
}
```

### Changing Contact Info

Update `personalInfo` in **both** files:
- Email
- Phone (use format: +88017-7638-7624)
- Location
- LinkedIn URL

**Don't forget** to update in both places!

## Keeping Web & PDF in Sync

### Checklist for Updates

- [ ] Update data in `/app/resume/page.tsx`
- [ ] Update matching data in `/components/printable-resume.tsx`
- [ ] Test web version (`/resume` page)
- [ ] Test PDF export (click "Download PDF")
- [ ] Verify content matches exactly
- [ ] Check PDF page breaks look good
- [ ] Commit both files together

### Why Two Files?

- **Separation of Concerns:** Web UI has different layout/styling needs than print
- **Print Optimization:** PDF version has different spacing, fonts, and page breaks
- **Content Control:** Allows showing/hiding specific fields per version

**Trade-off:** Must manually keep content synchronized. Future enhancement could use a shared data file.

## Troubleshooting

**PDF doesn't update after changes:**
- Hard refresh browser (Ctrl+Shift+R / Cmd+Shift+R)
- Clear Next.js cache: `rm -rf .next && pnpm dev`
- Check you updated **both** files

**Page breaks in wrong places:**
- Adjust content length (shorter descriptions)
- Add `page-break-inside: avoid` to sections
- Use `page-break-before: always` to force new page

**Content cut off in PDF:**
- Check `@page` margins in print styles
- Reduce content length
- Adjust font sizes for print

**Icons not showing in PDF:**
- Lucide icons may not print; consider using text labels
- Test print preview before finalizing

---

**Last Updated:** November 2025  
**Maintainer:** Md Redwan Ahmed
