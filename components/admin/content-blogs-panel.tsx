import { BookOpen, ExternalLink, RefreshCw } from 'lucide-react';
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
import { getBlogPostsPage } from '@/lib/blogger';
import { trySanitizeHttpUrl } from '@/lib/security/safe-redirect';

/**
 * Blogger feed sync console, rendered inline inside the Content Studio hub so the
 * hub header and tab bar stay in place when switching to this tab.
 */
export async function ContentBlogsPanel() {
  const pageData = await getBlogPostsPage(1, 12, 12).catch(() => ({
    posts: [],
    totalItems: 0,
    isCapped: false,
  }));

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-4 w-4 text-primary" />
            Synced Posts Preview ({pageData.totalItems} total indexed)
          </CardTitle>
          <CardDescription className="mt-1 text-xs">
            Google Blogger feed health. Sourced via service-account credentials (BLOGGER_BLOG_ID /
            GOOGLE_CREDENTIALS_B64). Purge after publishing a post to flush memory and ISR caches.
          </CardDescription>
        </div>
        <ActionFeedbackForm
          action={syncBloggerCacheAction}
          successMessage="Blogger cache cleared and /blogs revalidated."
        >
          <Button type="submit" size="sm" className="gap-1.5 rounded-full">
            <RefreshCw className="h-3.5 w-3.5" />
            Purge Cache &amp; Force Sync
          </Button>
        </ActionFeedbackForm>
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
                  <TableCell className="text-xs font-semibold sm:text-sm">{post.title}</TableCell>
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
                      <a
                        href={trySanitizeHttpUrl(post.url) ?? 'https://blogs.redwan.work'}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
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
            No blog articles currently loaded (or Blogger credentials are unset in this
            environment).
          </p>
        )}
      </CardContent>
    </Card>
  );
}
