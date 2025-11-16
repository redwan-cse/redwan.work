# Blogs System Documentation

The blogs page fetches and displays articles from Google Blogger, with pagination, image preview, and a modal for quick article viewing.

## Overview

- **Data Source:** Google Blogger API
- **Page:** `/app/blogs/page.tsx`
- **API Integration:** `/lib/blogger.ts`
- **Posts Per Page:** 9
- **Revalidation:** ISR with 60-second revalidation

## How It Works

### Data Fetching

1. **Server-Side Rendering:** Blog posts are fetched server-side using the Blogger API v3.
2. **Credentials:** Uses base64-encoded Google service account credentials from environment variables.
3. **Caching:** Next.js ISR automatically caches posts and revalidates every 60 seconds.

**Environment Variables Required:**
```env
BLOGGER_ID=your_blogger_blog_id
GOOGLE_CREDENTIALS_B64=base64_encoded_service_account_json
```

### Display Features

**Card Layout:**
- Grid of 9 posts per page (3 columns on desktop, 2 on tablet, 1 on mobile)
- Each card shows:
  - Featured image (extracted from post content)
  - Post title
  - Excerpt (first ~200 characters, HTML stripped)
  - Published date (relative, e.g., "2 days ago")
  - Category badge (if labeled)
  - "Read More" and "Quick Preview" buttons

**Hover Effects:**
- Card lifts on hover with subtle shadow
- Image scales slightly
- Smooth transitions

**Pagination:**
- Previous/Next buttons at bottom
- URL-based pagination: `/blogs?page=2`
- Disabled state when at first/last page

### Preview Modal

**Component:** `/components/blog-preview-modal.tsx`

Opens a dialog showing:
- Full-size featured image
- Post title
- Published date
- Longer excerpt (first 500 characters)
- "Read Full Article" button linking to Blogger

**Purpose:** Lets users preview content without leaving the site. External Blogger link is for full reading experience.

## Limitations

- **Read-Only:** Posts are fetched from Blogger; no editing capability on this site.
- **No Comments:** Comments remain on Blogger platform.
- **No Search/Filter:** Currently displays all posts in chronological order (newest first).
- **Images:** First image from post HTML is extracted; posts without images get a fallback Unsplash photo.

## Maintenance

### When You Publish a New Blog Post

**On Blogger:**
1. Write and publish post on Blogger as usual.
2. Wait up to 60 seconds for ISR to refresh.
3. New post appears automatically on `/blogs`.

**Manual Revalidation (Optional):**
If you need immediate updates, trigger revalidation:

```bash
curl -X POST "https://redwan.work/api/revalidate?secret=YOUR_SECRET&path=/blogs"
```

This bypasses the 60-second wait.

### Modifying Blog Display

**Change Posts Per Page:**
Edit `POSTS_PER_PAGE` constant in `/app/blogs/page.tsx`:
```typescript
const POSTS_PER_PAGE = 12; // Change to desired number
```

**Excerpt Length:**
Edit `extractExcerpt()` in `/lib/blogger.ts`:
```typescript
export function extractExcerpt(content: string, maxLength: number = 300) {
  // Default is 200, increase as needed
}
```

**Fallback Image:**
Change default image in `extractFirstImage()` in `/lib/blogger.ts`:
```typescript
return match
  ? match[1]
  : "https://your-custom-fallback-image.jpg";
```

## Troubleshooting

**Posts Not Loading:**
- Check environment variables are set in Vercel/`.env.local`
- Verify Blogger API is enabled in Google Cloud Console
- Check service account has "Blogger Reader" permission
- Look for errors in browser console or Vercel logs

**Images Not Displaying:**
- Add image domain to `next.config.js` `remotePatterns`:
  ```javascript
  images: {
    remotePatterns: [
      { hostname: 'blogger.googleusercontent.com' },
      { hostname: 'images.unsplash.com' },
    ],
  }
  ```

**Pagination Broken:**
- Ensure `searchParams` is awaited in page component
- Check URL format: `/blogs?page=2` (not `/blogs/2`)

## Future Enhancements

Planned improvements:
- Search functionality
- Category/tag filtering
- Related posts suggestions
- Reading time estimation
- Share buttons (social media)

---

**Last Updated:** November 2025  
**Maintainer:** Md Redwan Ahmed
