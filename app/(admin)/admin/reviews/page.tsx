import { Star } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { toggleReviewPublicApprovalAction } from '@/lib/crm/actions';

export const dynamic = 'force-dynamic';

export default async function AdminReviewsPage() {
  const admin = getSupabaseAdmin();
  const { data: reviews } = await admin
    .from('client_reviews')
    .select('*')
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-8">
      <div>
        <Badge variant="outline" className="mb-2 gap-1.5 font-mono text-xs text-primary">
          <Star className="h-3.5 w-3.5" />
          VERIFIED CLIENT TESTIMONIALS
        </Badge>
        <h1 className="text-3xl font-bold tracking-tight">Client Reviews &amp; Ratings</h1>
        <p className="text-sm text-muted-foreground">
          Review 1–5★ feedback submitted on completed orders and approve testimonials for public display.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Submitted Reviews</CardTitle>
        </CardHeader>
        <CardContent>
          {reviews && reviews.length > 0 ? (
            <div className="divide-y divide-border/70">
              {reviews.map((rev) => (
                <div
                  key={rev.id}
                  className="flex flex-wrap items-center justify-between gap-4 py-4"
                >
                  <div className="max-w-2xl space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-primary">
                        {'★'.repeat(rev.rating_overall)} ({rev.rating_overall}/5)
                      </span>
                      <Badge variant={rev.is_public_approved ? 'default' : 'outline'} className="font-mono text-[10px]">
                        {rev.is_public_approved ? 'Public' : 'Private'}
                      </Badge>
                    </div>
                    {rev.headline && <div className="font-bold">{rev.headline}</div>}
                    <p className="text-sm text-muted-foreground">{rev.review_text}</p>
                  </div>

                  <form action={toggleReviewPublicApprovalAction}>
                    <input type="hidden" name="review_id" value={rev.id} />
                    <input
                      type="hidden"
                      name="is_public_approved"
                      value={rev.is_public_approved ? 'false' : 'true'}
                    />
                    <Button type="submit" variant="outline" size="sm" className="rounded-full text-xs">
                      {rev.is_public_approved ? 'Hide from Public' : 'Approve for Public'}
                    </Button>
                  </form>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No client reviews submitted yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
