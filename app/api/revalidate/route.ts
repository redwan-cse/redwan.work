// app/api/revalidate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

export async function POST(request: NextRequest) {
  console.log("Revalidation API route called."); // Log when route is hit
  try {
    const token = request.headers.get('x-revalidate-token');
    const expectedToken = process.env.REVALIDATE_TOKEN;

    if (!expectedToken) {
      console.error("❌ REVALIDATE_TOKEN environment variable is not set on Vercel!");
      return NextResponse.json({ message: 'Server error: Revalidation token not configured' }, { status: 500 });
    }

    if (!token || token !== expectedToken) {
      console.warn("⚠️ Invalid revalidate token received.");
      return NextResponse.json({ message: 'Invalid token' }, { status: 401 });
    }

    revalidatePath('/blogs');
    console.log("✅ Successfully revalidated path: /blogs");
    return NextResponse.json({ revalidated: true, now: Date.now() });

  } catch (error: any) { // Explicitly type error as any for broader catch
    console.error("🔥 Revalidation Error:", error.message || error); // Log error message if available
    return NextResponse.json(
      { message: 'Error revalidating', error: String(error.message || error) },
      { status: 500 }
    );
  }
}

export const runtime = 'edge'; // Specify edge runtime