// app/api/revalidate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('x-revalidate-token');

    if (!process.env.REVALIDATE_TOKEN || token !== process.env.REVALIDATE_TOKEN) {
      return NextResponse.json({ message: 'Invalid token' }, { status: 401 });
    }

    // Revalidate the blog posts page
    revalidatePath('/blogs');

    return NextResponse.json({ revalidated: true, now: Date.now() }); //Use 'now' for consistency
  } catch (error) {
    console.error("Revalidation Error:", error); // Log the error for debugging
    return NextResponse.json(
      { message: 'Error revalidating', error: String(error) },
      { status: 500 }
    );
  }
}

export const runtime = 'edge'; // Specify edge runtime for the revalidate route