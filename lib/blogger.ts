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

export interface BlogTocItem {
  level: 2 | 3;
  id: string;
  text: string;
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
let cacheGeneration = 0;

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
  cacheGeneration++;
  blogCache.clear();
  inFlightRequests.clear();
  rawPostsSnapshot = null;
  rawPostsInFlight = null;
}

export function createBloggerAuthFromBase64(encodedCredentials: string) {
  const credentialsJSON = Buffer.from(encodedCredentials, "base64").toString("utf-8");
  const credentials = JSON.parse(credentialsJSON) as {
    client_email?: unknown;
    private_key?: unknown;
  };

  const clientEmail =
    typeof credentials?.client_email === "string" ? credentials.client_email.trim() : "";
  const privateKey =
    typeof credentials?.private_key === "string" ? credentials.private_key : "";

  if (!clientEmail || !privateKey) {
    return null;
  }

  return new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/blogger.readonly"],
  });
}

function createBloggerClient() {
  const BLOG_ID = process.env.BLOGGER_BLOG_ID || process.env.BLOGGER_ID;
  const encodedCredentials = process.env.GOOGLE_CREDENTIALS_B64;

  if (!BLOG_ID || !encodedCredentials) {
    return null;
  }

  const auth = createBloggerAuthFromBase64(encodedCredentials);
  if (!auth) {
    return null;
  }

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
  const fixtureRaw = process.env.BLOGGER_FIXTURE_POSTS_JSON;
  if (fixtureRaw) {
    try {
      const parsed = JSON.parse(fixtureRaw) as BloggerPostItem[];
      const items = Array.isArray(parsed) ? parsed.slice(0, MAX_POSTS_FETCH) : [];
      return {
        items,
        totalItems: items.length,
        isCapped: Array.isArray(parsed) && parsed.length > MAX_POSTS_FETCH,
      };
    } catch {
      return { items: [], totalItems: 0, isCapped: false };
    }
  }

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
  const generation = cacheGeneration;
  const request = fetchAllBloggerPosts().then(result => {
    if (generation === cacheGeneration) {
      rawPostsSnapshot = { ...result, expiresAt: Date.now() + BLOGGER_CACHE_TTL_MS };
    }
    return result;
  });
  rawPostsInFlight = request;
  try {
    return await request;
  } finally {
    if (rawPostsInFlight === request) rawPostsInFlight = null;
  }
}

export const BLOG_GRID_PER_PAGE = 9;
export const BLOG_FIRST_PAGE_COUNT = 10; // 1 featured dispatch + 9 grid cards

export function getBlogPaginationMeta(
  totalItems: number,
  currentPage: number,
  gridPerPage: number = BLOG_GRID_PER_PAGE,
  firstPageCount: number = BLOG_FIRST_PAGE_COUNT
) {
  const safeTotal = Math.max(0, totalItems);
  const safeGrid = Math.max(1, gridPerPage);
  const safeFirst = Math.max(1, firstPageCount);
  const totalPages =
    safeTotal <= safeFirst
      ? 1
      : 1 + Math.ceil((safeTotal - safeFirst) / safeGrid);
  const safePage = Math.max(1, Math.floor(currentPage));
  const startIndex = safePage === 1 ? 0 : safeFirst + (safePage - 2) * safeGrid;
  const pageSize = safePage === 1 ? safeFirst : safeGrid;

  return { totalPages, startIndex, pageSize };
}

async function fetchBlogPostsPage(
  page: number,
  perPage: number,
  firstPageCount?: number
): Promise<BlogPostsPage> {
  try {
    const snapshot = await getRawPostsSnapshot();
    const { startIndex, pageSize } = getBlogPaginationMeta(
      snapshot.totalItems,
      page,
      perPage,
      firstPageCount ?? perPage
    );
    const posts =
      startIndex < snapshot.items.length
        ? snapshot.items.slice(startIndex, startIndex + pageSize).map(mapPost)
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
 * Each (page, perPage, firstPageCount) combination is cached for BLOGGER_CACHE_TTL_MS,
 * bounded by MAX_CACHE_ENTRIES with insertion-order eviction and in-flight request coalescing.
 */
export async function getBlogPostsPage(
  page: number,
  perPage: number,
  firstPageCount?: number
): Promise<BlogPostsPage> {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safePerPage = Number.isFinite(perPage) && perPage > 0 ? Math.floor(perPage) : BLOG_GRID_PER_PAGE;
  const safeFirstPage =
    firstPageCount !== undefined && Number.isFinite(firstPageCount) && firstPageCount > 0
      ? Math.floor(firstPageCount)
      : safePerPage;

  const key = `p${safePage}-n${safePerPage}-f${safeFirstPage}`;
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

  const generation = cacheGeneration;
  const promise = fetchBlogPostsPage(safePage, safePerPage, safeFirstPage).then(data => {
    if (generation === cacheGeneration) {
      setCacheEntry(key, data, Date.now());
    }
    return data;
  });

  inFlightRequests.set(key, promise);
  try {
    return await promise;
  } finally {
    if (inFlightRequests.get(key) === promise) inFlightRequests.delete(key);
  }
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
 * Strip HTML tags and residual angle brackets into safe plain text.
 * Decodes markup entities before tag removal and decodes `&amp;` last so
 * neither encoded tags (`&lt;script&gt;`) nor nested fragments (`<scr<script>ipt>`)
 * can survive as markup, while `&amp;lt;` remains literal `&lt;`.
 */
const NON_PROSE_BLOCK_PATTERNS: RegExp[] = [
  /<style\b[^>]*>[\s\S]*?<\/style>/gi,
  /<script\b[^>]*>[\s\S]*?<\/script>/gi,
  /<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi,
  /<svg\b[^>]*>[\s\S]*?<\/svg>/gi,
  /<nav\b[^>]*class=["'][^"']*table-of-contents[^"']*["'][^>]*>[\s\S]*?<\/nav>/gi,
  /<div\b[^>]*class=["'][^"']*code-block-header[^"']*["'][^>]*>[\s\S]*?<\/div>/gi,
];

function stripNonProseBlocks(html: string, includeTocNav: boolean = true): string {
  let cleaned = html;
  const patterns = includeTocNav
    ? NON_PROSE_BLOCK_PATTERNS
    : NON_PROSE_BLOCK_PATTERNS.slice(0, 4);

  for (let pass = 0; pass < 20; pass += 1) {
    let next = cleaned;
    for (const pattern of patterns) {
      next = next.replace(pattern, " ");
    }
    if (next === cleaned) break;
    cleaned = next;
  }
  return cleaned;
}

function decodeHtmlEntitiesBeforeTagRemoval(text: string): string {
  return text
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/gi, "'")
    .replace(/&rsquo;|&#8217;/gi, "'")
    .replace(/&lsquo;|&#8216;/gi, "'")
    .replace(/&rdquo;|&#8221;/gi, '"')
    .replace(/&ldquo;|&#8220;/gi, '"')
    .replace(/&mdash;|&#8212;/gi, "—")
    .replace(/&ndash;|&#8211;/gi, "–")
    .replace(/&hellip;|&#8230;/gi, "...");
}

/**
 * Strip embedded CSS/scripts, HTML tags, and residual angle brackets into safe plain text.
 * Removes `<style>/<script>/<noscript>/<svg>`, TOC navs, and code-block chrome iteratively before
 * decoding markup entities and stripping tags char-by-char (with `&amp;` decoded last so
 * neither encoded tags (`&lt;script&gt;`) nor nested fragments (`<scr<script>ipt>`)
 * survive as markup, while `&amp;lt;` remains literal `&lt;`).
 */
export function stripHtmlToPlainText(content: string): string {
  const withoutNonProse = stripNonProseBlocks(content)
    .replace(/<\/(?:p|div|li|blockquote|pre|tr|h[1-6])>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ");

  const preDecoded = decodeHtmlEntitiesBeforeTagRemoval(withoutNonProse);

  let out = "";
  let inTag = false;
  for (let i = 0; i < preDecoded.length; i += 1) {
    const ch = preDecoded[i];
    if (ch === "<") {
      inTag = true;
      continue;
    }
    if (ch === ">") {
      inTag = false;
      continue;
    }
    if (!inTag) {
      out += ch;
    }
  }

  return out
    .replace(/&amp;/g, "&")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Extract plain text excerpt from HTML content
 */
export function extractExcerpt(content: string, maxLength: number = 200): string {
  const text = stripHtmlToPlainText(content);
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function slugifyHeading(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "section"
  );
}

/**
 * Extract structured Table of Contents items (`h2` / `h3`, matching `blogs.redwan.work`)
 * from a Blogger HTML article for Quick Preview display.
 */
export function extractBlogToc(content: string, maxItems: number = 40): BlogTocItem[] {
  const withoutScripts = stripNonProseBlocks(content, false)
    .replace(/<nav\b[^>]*class=["'][^"']*table-of-contents[^"']*["'][^>]*>[\s\S]*?<\/nav>/gi, " ");

  const items: BlogTocItem[] = [];
  const usedIds = new Map<string, number>();

  const pushUnique = (level: 2 | 3, rawId: string | undefined, rawText: string) => {
    const cleanText = rawText.replace(/^[\s#§]+|[\s#§]+$/g, "").trim();
    if (!cleanText || /^table of contents$/i.test(cleanText)) return;

    const baseId = rawId?.trim() || slugifyHeading(cleanText);
    const seen = usedIds.get(baseId) ?? 0;
    usedIds.set(baseId, seen + 1);
    const uniqueId = seen === 0 ? baseId : `${baseId}-${seen + 1}`;
    items.push({ level, id: uniqueId, text: cleanText });
  };

  const headingRegex = /<(h[23])\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(withoutScripts)) !== null) {
    if (items.length >= maxItems) break;
    const tag = match[1].toLowerCase();
    const attrs = match[2] ?? "";
    const innerHtml = match[3] ?? "";

    if (/(?:toc-title|related-posts-title|post-title)/i.test(attrs)) continue;

    const strippedInner = innerHtml.replace(
      /<a\b[^>]*class=["'][^"']*heading-anchor[^"']*["'][^>]*>[\s\S]*?<\/a>/gi,
      " "
    );
    const text = stripHtmlToPlainText(strippedInner);
    const idMatch = attrs.match(/\bid\s*=\s*["']([^"']+)["']/i);
    pushUnique(tag === "h3" ? 3 : 2, idMatch?.[1], text);
  }

  if (items.length > 0) return items;

  // Fallback for posts that only embed a static <nav class="table-of-contents"> list
  const navMatch = stripNonProseBlocks(content, false).match(
    /<nav\b[^>]*class=["'][^"']*table-of-contents[^"']*["'][^>]*>([\s\S]*?)<\/nav>/i
  );
  if (!navMatch) return items;

  const linkRegex = /<a\b[^>]*href=["']#([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  while ((match = linkRegex.exec(navMatch[1])) !== null) {
    if (items.length >= maxItems) break;
    pushUnique(2, match[1], stripHtmlToPlainText(match[2]));
  }

  return items;
}
