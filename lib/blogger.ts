// lib/blogger.ts
import crypto from "node:crypto";

export interface BlogPost {
  id: string;
  title: string;
  content: string;
  url: string;
  published: string;
  author?: string;
  labels?: string[];
}

/** Client-safe summary passed across the RSC boundary without raw HTML bodies. */
export type BlogPostSummary = Omit<BlogPost, "content">;

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
 * Module-level TTL + Stale-While-Revalidate cache for Blogger responses.
 *
 * Keeps /blogs dynamically rendered so new posts sync in real time without static builds:
 * - Within FRESH_TTL (60s): served immediately from memory.
 * - Between FRESH_TTL (60s) and STALE_TTL (10m): served immediately while a non-blocking
 *   background refresh fetches the latest Blogger posts for subsequent visits.
 *
 * Uses native Node `crypto` RS256 JWT signing + `fetch()` against Blogger REST v3
 * (zero `googleapis` bundle overhead).
 */
const BLOGGER_FRESH_TTL_MS = 60_000;
const BLOGGER_STALE_TTL_MS = 10 * 60_000;
const MAX_CACHE_ENTRIES = 50;
const BLOGGER_API_TIMEOUT_MS = 10_000;
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const BLOGGER_READONLY_SCOPE = "https://www.googleapis.com/auth/blogger.readonly";

interface CacheEntry {
  data: BlogPostsPage;
  expiresAt: number;
  version: number;
}

interface RawSnapshot {
  items: BloggerPostItem[];
  totalItems: number;
  isCapped: boolean;
  freshUntil: number;
  staleUntil: number;
}

interface AccessTokenCacheEntry {
  accessToken: string;
  expiresAt: number;
}

export interface BloggerJwtAuth {
  email: string;
  privateKey: string;
  scopes: string[];
  getAccessToken: () => Promise<string>;
}

const blogCache = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<BlogPostsPage>>();
const tokenCache = new Map<string, AccessTokenCacheEntry>();
let cacheGeneration = 0;
let snapshotVersion = 0;

let rawPostsSnapshot: RawSnapshot | null = null;
let rawPostsInFlight: Promise<{ items: BloggerPostItem[]; totalItems: number; isCapped: boolean }> | null = null;

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function signServiceAccountJwt(email: string, privateKey: string, scopes: string[]): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      iss: email,
      scope: scopes.join(" "),
      aud: GOOGLE_OAUTH_TOKEN_URL,
      iat: nowSec,
      exp: nowSec + 3600,
    })
  );
  const signingInput = `${header}.${payload}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = base64UrlEncode(signer.sign(privateKey));
  return `${signingInput}.${signature}`;
}

async function exchangeJwtForAccessToken(
  email: string,
  privateKey: string,
  scopes: string[]
): Promise<string> {
  const cacheKey = `${email}:${scopes.join(",")}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.accessToken;
  }

  const assertion = signServiceAccountJwt(email, privateKey, scopes);
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(BLOGGER_API_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Google OAuth token exchange failed (${response.status})`);
  }

  const json = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) {
    throw new Error("Google OAuth token response missing access_token");
  }

  const ttlSec = Number.isFinite(json.expires_in) && (json.expires_in ?? 0) > 60 ? Number(json.expires_in) : 3300;
  tokenCache.set(cacheKey, {
    accessToken: json.access_token,
    expiresAt: Date.now() + ttlSec * 1000,
  });

  return json.access_token;
}

function sweepExpiredCache(now: number) {
  for (const [key, entry] of blogCache.entries()) {
    if (entry.expiresAt <= now || entry.version !== snapshotVersion) {
      blogCache.delete(key);
    }
  }
}

function setCacheEntry(key: string, data: BlogPostsPage, now: number, version: number) {
  sweepExpiredCache(now);
  if (blogCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = blogCache.keys().next().value;
    if (oldestKey !== undefined) {
      blogCache.delete(oldestKey);
    }
  }
  blogCache.set(key, { data, expiresAt: now + BLOGGER_FRESH_TTL_MS, version });
}

/** Drop all cached blog pages (called after on-demand revalidation). */
export function clearBlogCache() {
  cacheGeneration++;
  snapshotVersion++;
  blogCache.clear();
  inFlightRequests.clear();
  rawPostsSnapshot = null;
  rawPostsInFlight = null;
}

export function createBloggerAuthFromBase64(encodedCredentials: string): BloggerJwtAuth | null {
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

  const scopes = [BLOGGER_READONLY_SCOPE];
  return {
    email: clientEmail,
    privateKey,
    scopes,
    getAccessToken: () => exchangeJwtForAccessToken(clientEmail, privateKey, scopes),
  };
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
    auth,
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

interface BloggerBlogMetaResponse {
  posts?: { totalItems?: number };
}

interface BloggerPostsListResponse {
  items?: BloggerPostItem[];
  nextPageToken?: string;
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

async function fetchBloggerJson<T>(url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(BLOGGER_API_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Blogger API request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

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

  const accessToken = await client.auth.getAccessToken();
  const baseUrl = `https://www.googleapis.com/blogger/v3/blogs/${encodeURIComponent(client.blogId)}`;

  const allItems: BloggerPostItem[] = [];
  let pageToken: string | undefined;
  let isCapped = false;

  // Fetch blog metadata in parallel with page 1 of posts.list to save a network RTT.
  const blogMetaPromise = fetchBloggerJson<BloggerBlogMetaResponse>(baseUrl, accessToken).catch(
    () => null
  );

  do {
    const remaining = MAX_POSTS_FETCH - allItems.length;
    if (remaining <= 0) break;

    const query = new URLSearchParams({
      maxResults: String(Math.min(remaining, POSTS_PER_API_CALL)),
      fetchImages: "true",
      status: "live",
    });
    if (pageToken) {
      query.set("pageToken", pageToken);
    }

    const data = await fetchBloggerJson<BloggerPostsListResponse>(
      `${baseUrl}/posts?${query.toString()}`,
      accessToken
    );

    const items = (data.items ?? []) as BloggerPostItem[];
    allItems.push(...items);
    if (allItems.length >= MAX_POSTS_FETCH && data.nextPageToken) {
      isCapped = true;
      pageToken = undefined;
    } else {
      pageToken = data.nextPageToken ?? undefined;
    }
  } while (pageToken);

  let totalItems = allItems.length;
  const blogMeta = await blogMetaPromise;
  const metaCount = Number(blogMeta?.posts?.totalItems);
  if (Number.isSafeInteger(metaCount) && metaCount > 0) {
    if (metaCount > MAX_POSTS_FETCH) {
      isCapped = true;
      totalItems = MAX_POSTS_FETCH;
    } else {
      totalItems = Math.max(allItems.length, metaCount);
    }
  }

  return { items: allItems, totalItems, isCapped };
}

function startRawPostsRefresh(): Promise<{ items: BloggerPostItem[]; totalItems: number; isCapped: boolean }> {
  if (rawPostsInFlight) {
    return rawPostsInFlight;
  }
  const generation = cacheGeneration;
  const request = fetchAllBloggerPosts()
    .then(result => {
      if (generation === cacheGeneration) {
        const completedAt = Date.now();
        rawPostsSnapshot = {
          ...result,
          freshUntil: completedAt + BLOGGER_FRESH_TTL_MS,
          staleUntil: completedAt + BLOGGER_STALE_TTL_MS,
        };
        snapshotVersion++;
        blogCache.clear();
      }
      return result;
    })
    .finally(() => {
      if (rawPostsInFlight === request) rawPostsInFlight = null;
    });
  rawPostsInFlight = request;
  return request;
}

async function getRawPostsSnapshot(): Promise<{ items: BloggerPostItem[]; totalItems: number; isCapped: boolean }> {
  // Deterministic offline fixtures always evaluate immediately without stale caching.
  if (process.env.BLOGGER_FIXTURE_POSTS_JSON) {
    return fetchAllBloggerPosts();
  }

  const now = Date.now();
  if (rawPostsSnapshot && rawPostsSnapshot.freshUntil > now) {
    return rawPostsSnapshot;
  }
  if (rawPostsSnapshot && rawPostsSnapshot.staleUntil > now) {
    // Serve warm posts immediately and revalidate in the background for real-time Blogger updates.
    void startRawPostsRefresh().catch(() => undefined);
    return rawPostsSnapshot;
  }
  return startRawPostsRefresh();
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
  const isFixtureMode = Boolean(process.env.BLOGGER_FIXTURE_POSTS_JSON);

  if (!isFixtureMode) {
    sweepExpiredCache(now);
    const hit = blogCache.get(key);
    if (hit && hit.expiresAt > now && hit.version === snapshotVersion) {
      if (rawPostsSnapshot && now >= rawPostsSnapshot.freshUntil && rawPostsSnapshot.staleUntil > now) {
        void startRawPostsRefresh().catch(() => undefined);
      }
      return hit.data;
    }
  }

  const inFlight = inFlightRequests.get(key);
  if (inFlight) {
    return inFlight;
  }

  const generation = cacheGeneration;
  const promise = fetchBlogPostsPage(safePage, safePerPage, safeFirstPage).then(data => {
    if (generation === cacheGeneration && !isFixtureMode) {
      setCacheEntry(key, data, Date.now(), snapshotVersion);
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
const NON_PROSE_TAG_NAMES = ["style", "script", "noscript", "svg"] as const;

const NON_PROSE_CHROME_PATTERNS: RegExp[] = [
  /<nav\b[^>]*class=["'][^"']*table-of-contents[^"']*["'][^>]*>[\s\S]*?<\/nav\b[^>]*>/gi,
  /<div\b[^>]*class=["'][^"']*code-block-header[^"']*["'][^>]*>[\s\S]*?<\/div\b[^>]*>/gi,
  /<a\b[^>]*class=["'][^"']*heading-anchor[^"']*["'][^>]*>[\s\S]*?<\/a\b[^>]*>/gi,
];

function isTagNameBoundary(ch: string | undefined): boolean {
  return (
    ch === undefined ||
    ch === ">" ||
    ch === "/" ||
    ch === " " ||
    ch === "\t" ||
    ch === "\n" ||
    ch === "\r" ||
    ch === "\f"
  );
}

/**
 * Deterministically strips `<tagName ...>...</tagName ...>` blocks (including malformed closing tags
 * such as `</script >` or unclosed trailing blocks) without relying on tag-filtering regexes.
 */
function removeElementBlocksByTagName(input: string, tagName: string): string {
  const lower = input.toLowerCase();
  const openToken = `<${tagName}`;
  const closeToken = `</${tagName}`;
  let cursor = 0;
  let result = "";

  while (cursor < input.length) {
    const openIdx = lower.indexOf(openToken, cursor);
    if (openIdx === -1) {
      result += input.slice(cursor);
      break;
    }

    const afterOpen = lower[openIdx + openToken.length];
    if (!isTagNameBoundary(afterOpen)) {
      result += input.slice(cursor, openIdx + openToken.length);
      cursor = openIdx + openToken.length;
      continue;
    }

    result += input.slice(cursor, openIdx) + " ";
    const openEnd = lower.indexOf(">", openIdx + openToken.length);
    if (openEnd === -1) {
      break;
    }

    let searchFrom = openEnd + 1;
    let closedAt = -1;
    while (searchFrom < input.length) {
      const closeIdx = lower.indexOf(closeToken, searchFrom);
      if (closeIdx === -1) break;
      const afterClose = lower[closeIdx + closeToken.length];
      if (isTagNameBoundary(afterClose)) {
        const closeEnd = lower.indexOf(">", closeIdx + closeToken.length);
        closedAt = closeEnd === -1 ? input.length : closeEnd + 1;
        break;
      }
      searchFrom = closeIdx + closeToken.length;
    }

    if (closedAt === -1) {
      break;
    }
    cursor = closedAt;
  }

  return result;
}

function stripNonProseBlocks(html: string, includeTocNav: boolean = true): string {
  let cleaned = html;

  for (let pass = 0; pass < 20; pass += 1) {
    let next = cleaned;
    for (const tag of NON_PROSE_TAG_NAMES) {
      next = removeElementBlocksByTagName(next, tag);
    }
    if (includeTocNav) {
      for (const pattern of NON_PROSE_CHROME_PATTERNS) {
        next = next.replace(pattern, " ");
      }
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
