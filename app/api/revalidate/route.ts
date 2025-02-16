import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = request.headers.get('x-revalidate-token');

    if (!process.env.REVALIDATE_TOKEN || token !== process.env.REVALIDATE_TOKEN) {
      return NextResponse.json(
        { message: 'Invalid token' }, 
        { status: 401 }
      );
    }

    // Revalidate the blog posts page
    revalidatePath('/blogs');
    
    return NextResponse.json({
      revalidated: true,
      timestamp: Date.now(),
    });
  } catch (error) {
    return NextResponse.json(
      { message: 'Error revalidating', error: String(error) }, 
      { status: 500 }
    );
  }
}