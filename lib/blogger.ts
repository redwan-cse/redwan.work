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
  isCapped?: boolean;
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
const MAX_CACHE_ENTRIES = 50;

interface CacheEntry {
  data: BlogPostsPage;
  expiresAt: number;
}

const blogCache = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<BlogPostsPage>>();

let rawPostsSnapshot: { items: BloggerPostItem[]; totalItems: number; isCapped: boolean; expiresAt: number } | null = null;
let rawPostsInFlight: Promise<{ items: BloggerPostItem[]; totalItems: number; isCapped: boolean }> | null = null;

function sweepExpiredCache(now: number) {
  for (const [key, entry] of blogCache.entries()) {
    if (entry.expiresAt <= now) {
      blogCache.delete(key);
    }
  }
}

function setCacheEntry(key: string, data: BlogPostsPage, now: number) {
  sweepExpiredCache(now);
  if (blogCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = blogCache.keys().next().value;
    if (oldestKey !== undefined) {
      blogCache.delete(oldestKey);
    }
  }
  blogCache.set(key, { data, expiresAt: now + BLOGGER_CACHE_TTL_MS });
}

/** Drop all cached blog pages (called after on-demand revalidation). */
export function clearBlogCache() {
  blogCache.clear();
  inFlightRequests.clear();
  rawPostsSnapshot = null;
  rawPostsInFlight = null;
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

async function fetchAllBloggerPosts(): Promise<{ items: BloggerPostItem[]; totalItems: number; isCapped: boolean }> {
  const client = createBloggerClient();

  if (!client) {
    console.error("❌ Missing environment variables: BLOGGER_BLOG_ID or GOOGLE_CREDENTIALS_B64");
    return { items: [], totalItems: 0, isCapped: false };
  }

  const allItems: BloggerPostItem[] = [];
  let pageToken: string | undefined;
  let isCapped = false;

  do {
    const remaining = MAX_POSTS_FETCH - allItems.length;
    if (remaining <= 0) break;

    const response = await client.blogger.posts.list({
      blogId: client.blogId,
      maxResults: Math.min(remaining, POSTS_PER_API_CALL),
      pageToken,
      fetchImages: true,
      status: ['live'],
    });

    const items = (response.data.items ?? []) as BloggerPostItem[];
    allItems.push(...items);
    if (allItems.length >= MAX_POSTS_FETCH && response.data.nextPageToken) {
      isCapped = true;
      pageToken = undefined;
    } else {
      pageToken = response.data.nextPageToken ?? undefined;
    }
  } while (pageToken);

  let totalItems = allItems.length;
  if (typeof client.blogger.blogs?.get === 'function') {
    try {
      const blogMeta = await client.blogger.blogs.get({ blogId: client.blogId });
      const metaCount = Number(blogMeta?.data?.posts?.totalItems);
      if (Number.isSafeInteger(metaCount) && metaCount > 0) {
        if (metaCount > MAX_POSTS_FETCH) {
          isCapped = true;
          totalItems = MAX_POSTS_FETCH;
        } else {
          totalItems = Math.max(allItems.length, metaCount);
        }
      }
    } catch {
      // Graceful fallback to allItems.length
    }
  }

  return { items: allItems, totalItems, isCapped };
}

async function getRawPostsSnapshot(): Promise<{ items: BloggerPostItem[]; totalItems: number; isCapped: boolean }> {
  const now = Date.now();
  if (rawPostsSnapshot && rawPostsSnapshot.expiresAt > now) {
    return rawPostsSnapshot;
  }
  if (rawPostsInFlight) {
    return rawPostsInFlight;
  }
  rawPostsInFlight = (async () => {
    try {
      const result = await fetchAllBloggerPosts();
      rawPostsSnapshot = { ...result, expiresAt: Date.now() + BLOGGER_CACHE_TTL_MS };
      return result;
    } finally {
      rawPostsInFlight = null;
    }
  })();
  return rawPostsInFlight;
}

async function fetchBlogPostsPage(page: number, perPage: number): Promise<BlogPostsPage> {
  try {
    const snapshot = await getRawPostsSnapshot();
    const startIndex = (page - 1) * perPage;
    const posts =
      startIndex < snapshot.items.length
        ? snapshot.items.slice(startIndex, startIndex + perPage).map(mapPost)
        : [];

    return {
      posts,
      totalItems: snapshot.totalItems,
      isCapped: snapshot.isCapped,
    };
  } catch {
    console.error('Blogger fetch unavailable.');
    return { posts: [], totalItems: 0, isCapped: false };
  }
}

/**
 * Fetch one page of blog posts, backed by the module TTL cache and in-flight deduplication.
 *
 * Each (page, perPage) combination is cached for BLOGGER_CACHE_TTL_MS,
 * bounded by MAX_CACHE_ENTRIES with LRU eviction and in-flight request coalescing.
 */
export async function getBlogPostsPage(page: number, perPage: number): Promise<BlogPostsPage> {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safePerPage = Number.isFinite(perPage) && perPage > 0 ? Math.floor(perPage) : 9;

  const key = `p${safePage}-n${safePerPage}`;
  const now = Date.now();

  sweepExpiredCache(now);
  const hit = blogCache.get(key);
  if (hit && hit.expiresAt > now) {
    return hit.data;
  }

  const inFlight = inFlightRequests.get(key);
  if (inFlight) {
    return inFlight;
  }

  const promise = (async () => {
    try {
      const data = await fetchBlogPostsPage(safePage, safePerPage);
      setCacheEntry(key, data, Date.now());
      return data;
    } finally {
      inFlightRequests.delete(key);
    }
  })();

  inFlightRequests.set(key, promise);
  return promise;
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
  // Decode entities FIRST, then strip tags — decoding after stripping lets
  // `&lt;script&gt;` smuggle markup past the filter (CodeQL
  // js/incomplete-multi-character-sanitization). `&amp;` decodes LAST so one
  // replacement's output can never feed a later one: `&amp;lt;` becomes the
  // literal text `&lt;`, never markup (CodeQL js/double-escaping). The tag
  // strip runs after all decoding, so nothing decoded survives as markup.
  let text = content
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&hellip;/g, "...")
    .replace(/&amp;/g, "&");

  // Strip HTML tags after decoding.
  // codeql[js/incomplete-multi-character-sanitization]: false positive in
  // context. This function returns PLAIN TEXT whose sole consumer renders it
  // as a JSX text child (`BlogPreviewModal`, auto-escaped by React) — never
  // as HTML. Do NOT pass its output to dangerouslySetInnerHTML without a
  // real sanitizer (e.g. DOMPurify).
  text = text.replace(/<[^>]*>/g, "");
  
  // Trim whitespace and remove extra spaces
  text = text.trim().replace(/\s+/g, " ");
  
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}
