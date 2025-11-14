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

/**
 * Fetch blog posts from Google Blogger API
 * 
 * @param maxResults - Maximum number of posts to fetch (default: 20)
 * @returns Array of blog posts
 */
export async function getBlogPosts(maxResults: number = 20): Promise<BlogPost[]> {
  const BLOG_ID = process.env.BLOGGER_ID;
  const encodedCredentials = process.env.GOOGLE_CREDENTIALS_B64;

  if (!BLOG_ID || !encodedCredentials) {
    console.error("❌ Missing environment variables: BLOGGER_ID or GOOGLE_CREDENTIALS_B64");
    return [];
  }

  try {
    const credentialsJSON = Buffer.from(encodedCredentials, "base64").toString("utf-8");
    const credentials = JSON.parse(credentialsJSON);

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/blogger.readonly"],
    });

    const blogger = google.blogger({ version: "v3", auth });
    const response = await blogger.posts.list({ 
      blogId: BLOG_ID,
      maxResults,
      fetchImages: true,
      status: ['live'], // Only fetch published posts
    });

    if (!response.data.items) {
      console.warn("⚠️ No blog posts found.");
      return [];
    }

    return response.data.items.map((post) => ({
      id: post.id || "",
      title: post.title || "Untitled",
      content: post.content || "",
      url: post.url || "#",
      published: post.published || new Date().toISOString(),
      author: post.author?.displayName,
      labels: post.labels || undefined,
    }));
  } catch (error) {
    console.error("❌ Error fetching blog posts:", error);
    return [];
  }
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
  const text = content.replace(/<[^>]*>/g, "").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}
