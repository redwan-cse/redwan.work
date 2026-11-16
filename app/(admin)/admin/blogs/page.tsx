import Link from 'next/link';
import { ArrowLeft, BookOpen, ExternalLink, RefreshCw } from 'lucide-react';
import { AdminHubHeader } from '@/components/admin/hub-header';
import { ActionFeedbackForm } from '@/components/panel/action-feedback-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { syncBloggerCacheAction } from '@/lib/admin/ops-actions';
import { requireAdminSession } from '@/lib/auth/session';
import { getBlogPostsPage } from '@/lib/blogger';

export const dynamic = 'force-dynamic';

export default async function AdminBlogsConsolePage() {
  await requireAdminSession();
  const pageData = await getBlogPostsPage(1, 12, 12).catch(() => ({
    posts: [],
    totalItems: 0,
    isCapped: false,
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/content"
          className="mb-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Content Studio
        </Link>

        <AdminHubHeader
          eyebrow="BLOGGER API & CACHE INVALIDATION"
          title="Blog Articles Feed & Cache Sync"
          description="Monitor Google Blogger feed sync health, review published technical articles, and manually flush memory & ISR caches after publishing a post."
          actions={
            <ActionFeedbackForm
              action={syncBloggerCacheAction}
              successMessage="Blogger cache cleared and /blogs revalidated."
            >
              <Button type="submit" size="sm" className="gap-1.5 rounded-full">
                <RefreshCw className="h-3.5 w-3.5" />
                Purge Cache &amp; Force Sync
              </Button>
            </ActionFeedbackForm>
          }
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-4 w-4 text-primary" />
            Synced Posts Preview ({pageData.totalItems} total indexed)
          </CardTitle>
          <CardDescription className="text-xs">
            Sourced via service-account credentials (BLOGGER_BLOG_ID / GOOGLE_CREDENTIALS_B64).
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {pageData.posts.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Article Title</TableHead>
                  <TableHead className="text-xs">Labels</TableHead>
                  <TableHead className="text-right text-xs">Published</TableHead>
                  <TableHead className="text-right text-xs">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageData.posts.map((post) => (
                  <TableRow key={post.id}>
                    <TableCell className="text-xs font-semibold sm:text-sm">
                      {post.title}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(post.labels ?? []).slice(0, 3).map((label) => (
                          <Badge key={label} variant="outline" className="font-mono text-[10px]">
                            {label}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-[11px] text-muted-foreground">
                      {new Date(post.published).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="ghost" className="h-7 gap-1 text-xs">
                        <a href={post.url} target="_blank" rel="noopener noreferrer">
                          View <ExternalLink className="h-3 w-3" />
                        </a>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No blog articles currently loaded (or Blogger credentials are unset in this environment).
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
