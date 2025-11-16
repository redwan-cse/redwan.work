# Home Page Documentation

Landing page showcasing Md Redwan Ahmed's cybersecurity expertise and services.

## Current Structure

**Page:** `/app/page.tsx`

### Implemented Sections

1. **Hero Section**
   - Full-viewport introduction with profile image
   - Name with gradient text effect
   - Role: "Founder & CEO of Fast Cyber Defense"
   - Brief description of expertise
   - CTA buttons:
     - "Hire on Fiverr" (primary)
     - "Hire on Upwork" (secondary)
   - Responsive grid layout (text left, image right on desktop)

2. **Services Grid**
   - Component: `/components/services-grid.tsx`
   - Grid of 6 core services with icons
   - Hover effects on cards
   - Links to `/services` page

3. **Featured Projects**
   - Component: `/components/project-carousel.tsx`
   - Carousel/slider of select projects
   - Auto-play with manual navigation
   - Links to project details

4. **Testimonials**
   - Component: `/components/testimonial-carousel.tsx`
   - Carousel of client testimonials
   - Auto-play functionality
   - Client names and roles

### Layout Features

- **Responsive Design:** Mobile-first, adapts to all screen sizes
- **Dark/Light Mode:** Full theme support with smooth transitions
- **Smooth Scrolling:** Anchor links scroll smoothly to sections
- **Performance:** Optimized images with Next.js Image component

## Planned Enhancements

The following sections are under active development and will be added in future updates:

### 1. Stats/Metrics Bar
- Years of experience
- Projects completed
- Clients served
- Security vulnerabilities found
- Positioned between hero and services

### 2. Featured Blog Posts
- Latest 3-4 blog posts from Blogger
- Card layout with images
- "View All Posts" link to `/blogs`

### 3. Case Studies Highlight
- 2-3 featured case studies with results
- Before/after scenarios
- Quantifiable outcomes
- Links to full case studies in `/portfolio`

### 4. Certifications & Awards
- Visual display of key certifications
- Badge-style icons
- Hover for details

### 5. Call-to-Action Section
- Bottom-of-page CTA
- Lead capture form or direct contact
- Urgency messaging

### 6. Trust Indicators
- Client logos (if permitted)
- Industry recognitions
- Professional affiliations

## Component Relationships

```
page.tsx (Home)
├── Hero Section (inline)
├── ServicesGrid (imported)
│   └── Links to /services
├── ProjectCarousel (imported)
│   └── Links to /portfolio
└── TestimonialCarousel (imported)
```

## Styling

- **Tailwind CSS:** Utility classes for all styling
- **CSS Variables:** Theme colors defined in `app/globals.css`
- **Animations:** Hover effects, gradient backgrounds, smooth transitions
- **Typography:** Bold headings, readable body text, hierarchical sizing

## Maintenance

### Updating Hero Text

Edit `/app/page.tsx`:
```tsx
<h1>
  Hi, I'm <span>Md Redwan Ahmed</span>
</h1>
<h2>Founder & CEO of Fast Cyber Defense</h2>
<p>
  Update bio text here...
</p>
```

### Changing CTA Buttons

Update button links:
```tsx
<Button asChild>
  <a href="https://new-link.com">
    New Button Text
  </a>
</Button>
```

### Modifying Services Grid

Edit `/components/services-grid.tsx`:
- Add/remove service objects
- Update icons from Lucide React
- Change descriptions

### Updating Testimonials

Edit `/components/testimonial-carousel.tsx`:
- Add/remove testimonial objects
- Update client names, roles, and quotes
- Adjust carousel settings (autoplay speed, etc.)

## Future Considerations

As sections are added:
- Keep page load time under 3 seconds
- Maintain mobile responsiveness
- Ensure accessibility (keyboard navigation, screen readers)
- Monitor Core Web Vitals (LCP, FID, CLS)
- A/B test CTA placements and messaging

---

**Last Updated:** November 2025  
**Status:** Hero and core sections complete; additional sections in development  
**Maintainer:** Md Redwan Ahmed
