// app/api/revalidate/route.ts
import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';

/**
 * API Route for On-Demand Revalidation
 * 
 * This endpoint allows you to manually trigger a revalidation of the blog page.
 * 
 * Usage:
 * POST /api/revalidate?secret=YOUR_SECRET&path=/blogs
 * 
 * Set REVALIDATION_SECRET in your Vercel environment variables
 */
export async function POST(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const secret = searchParams.get('secret');
  const path = searchParams.get('path') || '/blogs';

  // Check for secret to confirm this is a valid request
  if (secret !== process.env.REVALIDATION_SECRET) {
    return NextResponse.json(
      { message: 'Invalid secret' },
      { status: 401 }
    );
  }

  try {
    // Revalidate the specified path
    revalidatePath(path);
    
    return NextResponse.json({ 
      revalidated: true, 
      path,
      now: Date.now() 
    });
  } catch (err) {
    return NextResponse.json(
      { message: 'Error revalidating', error: String(err) },
      { status: 500 }
    );
  }
}

// Optional: GET endpoint to check if the API is working
export async function GET() {
  return NextResponse.json({
    message: 'Revalidation API is active. Use POST with ?secret=YOUR_SECRET&path=/blogs',
  });
}
