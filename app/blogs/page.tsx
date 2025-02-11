import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import Image from "next/image";
import Link from "next/link";
import { google } from "googleapis";

// Force Node.js runtime (required for googleapis and Buffer)
export const runtime = "nodejs";

// Page metadata for SEO
export const metadata = {
  title: "Blog Posts",
  description: "Insights and articles about cybersecurity, technology, and more",
};

// Implement ISR: revalidate the page at most every 60 seconds.
export const revalidate = 60;

// Define a TypeScript interface for blog posts
interface BlogPost {
  id: string;
  title: string;
  content: string;
  url: string;
  published: string;
}

// Fetch blog posts from Google Blogger API using Base64-encoded credentials
async function getBlogPosts(): Promise<BlogPost[]> {
  const BLOG_ID = process.env.BLOGGER_ID;
  const encodedCredentials = process.env.GOOGLE_CREDENTIALS_B64; // Base64 encoded credentials

  if (!BLOG_ID || !encodedCredentials) {
    console.error("❌ Missing environment variables: BLOGGER_ID or GOOGLE_CREDENTIALS_B64");
    return [];
  }

  try {
    // Decode the Base64 string and parse the JSON
    const credentialsJSON = Buffer.from(encodedCredentials, "base64").toString("utf-8");
    const credentials = JSON.parse(credentialsJSON);

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/blogger.readonly"],
    });

    const blogger = google.blogger({
      version: "v3",
      auth,
    });

    const response = await blogger.posts.list({
      blogId: BLOG_ID,
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
    }));
  } catch (error) {
    console.error("❌ Error fetching blog posts:", error);
    return [];
  }
}

// Extract the first image from blog content
function extractFirstImage(content: string): string {
  const imgRegex = /<img[^>]+src="([^">]+)"/;
  const match = content.match(imgRegex);
  return match
    ? match[1]
    : "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&h=400&fit=crop"; // Default image
}

// Extract plain text excerpt from content
function extractExcerpt(content: string, maxLength: number = 200): string {
  const text = content.replace(/<[^>]*>/g, ""); // Strip HTML tags
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

// Blog page component
export default async function BlogsPage() {
  const posts = await getBlogPosts();

  return (
    <div className="container py-12">
      <div className="mx-auto max-w-4xl text-center">
        <h1 className="mb-4 text-4xl font-bold">Blog Posts</h1>
        <p className="mb-12 text-lg text-muted-foreground">
          Insights and articles about cybersecurity, technology, and more
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {posts.length > 0 ? (
          posts.map((post) => (
            <Card key={post.id} className="flex flex-col overflow-hidden">
              <div className="relative h-48">
                <Image
                  src={extractFirstImage(post.content)}
                  alt={post.title}
                  fill
                  className="object-cover transition-transform duration-300 hover:scale-105"
                  loading="lazy"
                />
              </div>
              <CardHeader>
                <CardTitle className="line-clamp-2">{post.title}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {formatDistanceToNow(new Date(post.published), { addSuffix: true })}
                </p>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between gap-4">
                <p className="line-clamp-3 text-muted-foreground">
                  {extractExcerpt(post.content)}
                </p>
                <Link
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Read More
                </Link>
              </CardContent>
            </Card>
          ))
        ) : (
          <p className="text-center text-gray-500">No blog posts found.</p>
        )}
      </div>
    </div>
  );
}
