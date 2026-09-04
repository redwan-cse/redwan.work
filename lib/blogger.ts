// lib/blogger.ts
import { google } from "googleapis";

export interface BlogPost {
  id: string;
  title: string;
  content: string;
  url: string;
  published: string;
  author?: string;
  labels?: string[];
}

export interface BlogPostsPage {
  posts: BlogPost[];
  totalItems: number;
}

/**
 * Module-level TTL cache for Blogger responses.
 *
 * NOTE: each serverless instance keeps its own cache, so the Blogger API
 * may be hit once per TTL per instance — still a massive improvement over
 * fetching on every request. unstable_cache is intentionally avoided here
 * (it breaks with googleapis/gaxios under Next.js 16 + Turbopack).
 */
const BLOGGER_CACHE_TTL_MS = 60_000;

const blogCache = new Map<string, { data: BlogPostsPage; expiresAt: number }>();

/** Drop all cached blog pages (called after on-demand revalidation). */
export function clearBlogCache() {
  blogCache.clear();
}

function createBloggerClient() {
  const BLOG_ID = process.env.BLOGGER_BLOG_ID || process.env.BLOGGER_ID;
  const encodedCredentials = process.env.GOOGLE_CREDENTIALS_B64;

  if (!BLOG_ID || !encodedCredentials) {
    return null;
  }

  const credentialsJSON = Buffer.from(encodedCredentials, "base64").toString("utf-8");
  const credentials = JSON.parse(credentialsJSON);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/blogger.readonly"],
  });

  return {
    blogId: BLOG_ID,
    blogger: google.blogger({ version: "v3", auth }),
  };
}

/** Structural subset of a Blogger API post item (avoids deep namespace imports) */
interface BloggerPostItem {
  id?: string | null;
  title?: string | null;
  content?: string | null;
  url?: string | null;
  published?: string | null;
  author?: { displayName?: string | null } | null;
  labels?: string[] | null;
}

function mapPost(post: BloggerPostItem): BlogPost {
  return {
    id: post.id || "",
    title: post.title || "Untitled",
    content: post.content || "",
    url: post.url || "#",
    published: post.published || new Date().toISOString(),
    author: post.author?.displayName ?? undefined,
    labels: post.labels ?? undefined,
  };
}

// Safety cap so a hand-crafted ?page=999999 cannot request huge result sets
const MAX_POSTS_FETCH = 300;

// Blogger caps a single posts.list response well below this
const POSTS_PER_API_CALL = 100;

async function fetchBlogPostsPage(page: number, perPage: number): Promise<BlogPostsPage> {
  try {
    // Client creation can throw on malformed credentials — keep inside try
    const client = createBloggerClient();

    if (!client) {
      console.error("❌ Missing environment variables: BLOGGER_BLOG_ID or GOOGLE_CREDENTIALS_B64");
      return { posts: [], totalItems: 0 };
    }

    // The Blogger API paginates with opaque pageTokens and exposes no
    // total count, so collect posts newest-first (following nextPageToken)
    // up to the requested page and slice the tail. Results are cached,
    // so the API is hit at most once per TTL per instance.
    const target = Math.min(page * perPage, MAX_POSTS_FETCH);
    const allItems: BloggerPostItem[] = [];
    let pageToken: string | undefined;

    do {
      const response = await client.blogger.posts.list({
        blogId: client.blogId,
        maxResults: Math.min(target - allItems.length, POSTS_PER_API_CALL),
        pageToken,
        fetchImages: true,
        status: ['live'], // Only fetch published posts
      });

      const items = (response.data.items ?? []) as BloggerPostItem[];
      allItems.push(...items);
      pageToken =
        allItems.length < target && response.data.nextPageToken
          ? response.data.nextPageToken
          : undefined;
    } while (pageToken);

    // The requested page is the tail of everything collected so far
    const posts = allItems.slice(Math.max(0, allItems.length - perPage)).map(mapPost);

    return {
      posts,
      totalItems: allItems.length,
    };
  } catch (error) {
    console.error("❌ Error fetching blog posts:", error);
    return { posts: [], totalItems: 0 };
  }
}

/**
 * Fetch one page of blog posts, backed by the module TTL cache.
 *
 * Each (page, perPage) combination is cached for BLOGGER_CACHE_TTL_MS,
 * so traffic between refreshes never hits the Blogger API.
 */
export async function getBlogPostsPage(page: number, perPage: number): Promise<BlogPostsPage> {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safePerPage = Number.isFinite(perPage) && perPage > 0 ? Math.floor(perPage) : 9;

  const key = `p${safePage}-n${safePerPage}`;
  const now = Date.now();
  const hit = blogCache.get(key);

  if (hit && hit.expiresAt > now) {
    return hit.data;
  }

  const data = await fetchBlogPostsPage(safePage, safePerPage);
  blogCache.set(key, { data, expiresAt: now + BLOGGER_CACHE_TTL_MS });

  return data;
}

/**
 * Fetch the most recent blog posts from Google Blogger API (cached).
 *
 * @param maxResults - Maximum number of posts to fetch (default: 20)
 */
export async function getBlogPosts(maxResults: number = 20): Promise<BlogPost[]> {
  const result = await getBlogPostsPage(1, maxResults);
  return result.posts;
}

/**
 * Extract the first image URL from HTML content
 */
export function extractFirstImage(content: string): string {
  const imgRegex = /<img[^>]+src="([^">]+)"/;
  const match = content.match(imgRegex);
  return match
    ? match[1]
    : "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&h=400&fit=crop";
}

/**
 * Extract plain text excerpt from HTML content
 */
export function extractExcerpt(content: string, maxLength: number = 200): string {
  // Decode entities FIRST, then strip tags. Decoding after stripping lets
  // `&lt;script&gt;` smuggle markup past the filter, and `&amp;lt;` double-
  // decode into a live tag (CodeQL js/incomplete-multi-character-sanitization,
  // js/double-escaping). A single decode pass followed by the strip means
  // anything decoded can never survive as markup.
  let text = content
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&hellip;/g, "...");

  // Strip HTML tags after decoding
  text = text.replace(/<[^>]*>/g, "");
  
  // Trim whitespace and remove extra spaces
  text = text.trim().replace(/\s+/g, " ");
  
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}
