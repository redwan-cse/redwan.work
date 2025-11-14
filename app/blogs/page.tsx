// app/blogs/page.tsx

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import Image from "next/image";
import Link from "next/link";
import { getBlogPosts, extractFirstImage, extractExcerpt } from "@/lib/blogger";

// ISR: Revalidate every 60 seconds (1 minute)
// This means the page will be regenerated at most once per minute
export const revalidate = 60;

// Enable dynamic rendering for this page
export const dynamic = 'force-dynamic';

export const metadata = {
  title: "Blog Posts - Md Redwan Ahmed",
  description: "Latest insights and articles about cybersecurity, technology, and more",
};

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