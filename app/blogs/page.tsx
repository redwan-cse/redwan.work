// app/blogs/page.tsx

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import Image from "next/image";
import Link from "next/link";
import { getBlogPosts, extractFirstImage, extractExcerpt } from "@/lib/blogger";
import { Calendar, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { BlogPreviewModal } from "@/components/blog-preview-modal";

// ISR: Revalidate every 60 seconds (1 minute)
export const revalidate = 60;

// Enable dynamic rendering for this page
export const dynamic = 'force-dynamic';

export const metadata = {
  title: "Blog Posts - Md Redwan Ahmed",
  description: "Latest insights and articles about cybersecurity, technology, and more",
};

const POSTS_PER_PAGE = 9;

interface BlogsPageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function BlogsPage({ searchParams }: BlogsPageProps) {
  const params = await searchParams;
  const currentPage = Number(params.page) || 1;
  const allPosts = await getBlogPosts(100); // Fetch more posts to enable pagination
  
  const totalPosts = allPosts.length;
  const totalPages = Math.ceil(totalPosts / POSTS_PER_PAGE);
  const startIndex = (currentPage - 1) * POSTS_PER_PAGE;
  const endIndex = startIndex + POSTS_PER_PAGE;
  const posts = allPosts.slice(startIndex, endIndex);

  return (
    <div className="container py-12">
      {/* Hero Section */}
      <div className="mx-auto max-w-2xl text-center space-y-3 mb-12">
        <Badge className="text-xs" variant="secondary">
          {totalPosts} Articles
        </Badge>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
          Blog & Insights
        </h1>
        <p className="text-sm text-muted-foreground md:text-base max-w-xl mx-auto">
          Exploring cybersecurity, technology trends, and best practices
        </p>
      </div>

      {/* Blog Grid */}
      <div className="grid gap-8 md:gap-10 sm:grid-cols-2 lg:grid-cols-3">
        {posts.length > 0 ? (
          <>
            {posts.map((post, index) => {
                const imageUrl = extractFirstImage(post.content);
                const excerpt = extractExcerpt(post.content, 300);
                
                return (
                  <Card 
                    key={post.id} 
                    className="group flex flex-col overflow-hidden border-2 transition-all duration-300 hover:shadow-2xl hover:shadow-primary/10 hover:border-primary/50 hover:-translate-y-1"
                  >
                    {/* Image with Preview Modal */}
                    <BlogPreviewModal post={post} imageUrl={imageUrl} excerpt={excerpt}>
                      <div className="relative h-56 overflow-hidden bg-muted cursor-pointer">
                        <Image
                          src={imageUrl}
                          alt={post.title}
                          fill
                          className="object-cover transition-all duration-700 group-hover:scale-110 group-hover:brightness-110"
                          loading={index < 3 ? "eager" : "lazy"}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                        {post.labels && post.labels.length > 0 && (
                          <div className="absolute top-3 right-3">
                            <Badge variant="secondary" className="backdrop-blur-sm bg-background/90 text-xs">
                              {post.labels[0]}
                            </Badge>
                          </div>
                        )}
                      </div>
                    </BlogPreviewModal>

                    <CardHeader className="space-y-3 pb-3">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5" />
                        <time>
                          {formatDistanceToNow(new Date(post.published), { addSuffix: true })}
                        </time>
                      </div>
                      <BlogPreviewModal post={post} imageUrl={imageUrl} excerpt={excerpt}>
                        <CardTitle className="line-clamp-2 text-xl leading-tight font-bold cursor-pointer hover:text-primary transition-colors">
                          {post.title}
                        </CardTitle>
                      </BlogPreviewModal>
                    </CardHeader>

                    <CardContent className="flex flex-1 flex-col justify-between gap-4 pt-0">
                      <CardDescription className="line-clamp-3 text-sm leading-relaxed">
                        {excerpt.slice(0, 140)}...
                      </CardDescription>
                      
                      <Link
                        href={post.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex w-full"
                      >
                        <Button 
                          variant="outline" 
                          className="w-full group/btn text-sm font-medium h-10 hover:bg-primary hover:text-primary-foreground transition-all"
                        >
                          Read Full Article
                          <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
                        </Button>
                      </Link>
                    </CardContent>
                  </Card>
                );
              })}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="col-span-full mt-16 flex flex-col items-center gap-6">
                <div className="flex items-center justify-center gap-3 w-full">
                  {/* Previous Button */}
                  <Button
                    asChild
                    variant="outline"
                    size="default"
                    disabled={currentPage === 1}
                    className="h-10 px-4 gap-1.5"
                  >
                    {currentPage === 1 ? (
                      <span className="cursor-not-allowed flex items-center gap-1.5">
                        <ChevronLeft className="h-4 w-4" />
                        <span className="hidden sm:inline text-sm">Previous</span>
                      </span>
                    ) : (
                      <Link href={`/blogs?page=${currentPage - 1}`} className="flex items-center gap-1.5">
                        <ChevronLeft className="h-4 w-4" />
                        <span className="hidden sm:inline text-sm">Previous</span>
                      </Link>
                    )}
                  </Button>

                  {/* Page Numbers */}
                  <div className="flex items-center gap-2">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
                      // Show first page, last page, current page, and pages around current
                      const showPage =
                        pageNum === 1 ||
                        pageNum === totalPages ||
                        (pageNum >= currentPage - 1 && pageNum <= currentPage + 1);

                      const showEllipsisBefore = pageNum === currentPage - 2 && currentPage > 3;
                      const showEllipsisAfter = pageNum === currentPage + 2 && currentPage < totalPages - 2;

                      if (showEllipsisBefore || showEllipsisAfter) {
                        return (
                          <span key={pageNum} className="px-3 text-muted-foreground font-medium">
                            •••
                          </span>
                        );
                      }

                      if (!showPage) return null;

                      return (
                        <Button
                          key={pageNum}
                          asChild={pageNum !== currentPage}
                          variant={pageNum === currentPage ? "default" : "ghost"}
                          size="default"
                          className={`h-10 w-10 text-sm font-medium ${
                            pageNum === currentPage ? "" : ""
                          }`}
                        >
                          {pageNum === currentPage ? (
                            <span>{pageNum}</span>
                          ) : (
                            <Link href={`/blogs?page=${pageNum}`}>{pageNum}</Link>
                          )}
                        </Button>
                      );
                    })}
                  </div>

                  {/* Next Button */}
                  <Button
                    asChild
                    variant="outline"
                    size="default"
                    disabled={currentPage === totalPages}
                    className="h-10 px-4 gap-1.5"
                  >
                    {currentPage === totalPages ? (
                      <span className="cursor-not-allowed flex items-center gap-1.5">
                        <span className="hidden sm:inline text-sm">Next</span>
                        <ChevronRight className="h-4 w-4" />
                      </span>
                    ) : (
                      <Link href={`/blogs?page=${currentPage + 1}`} className="flex items-center gap-1.5">
                        <span className="hidden sm:inline text-sm">Next</span>
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    )}
                  </Button>
                </div>

                {/* Page Info */}
                <p className="text-sm text-muted-foreground text-center">
                  Showing <span className="font-medium">{startIndex + 1}-{Math.min(endIndex, totalPosts)}</span> of <span className="font-medium">{totalPosts}</span>
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="flex min-h-[500px] flex-col items-center justify-center gap-6 text-center py-20">
            <div className="rounded-full bg-primary/10 p-8 ring-8 ring-primary/5">
              <Calendar className="h-16 w-16 text-primary" />
            </div>
            <div className="space-y-3 max-w-md">
              <h3 className="text-3xl font-bold">No Articles Yet</h3>
              <p className="text-lg text-muted-foreground leading-relaxed">
                Check back soon for insightful articles on cybersecurity, technology, and industry best practices.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}