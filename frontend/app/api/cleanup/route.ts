import { NextRequest, NextResponse } from 'next/server';
import { backendFetch, isBackendConfigured } from '@/lib/backend';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }

    if (!isBackendConfigured()) {
      // Demo mode - just return success
      return NextResponse.json({ success: true });
    }

    const { data, error } = await backendFetch<{ success: boolean }>(
      '/api/cleanup',
      {
        method: 'POST',
        body: { url },
      }
    );

    if (error) {
      console.error('Cleanup error:', error);
      // Don't fail the request - cleanup is best-effort
      return NextResponse.json({ success: false });
    }

    return NextResponse.json({ success: data?.success ?? false });
  } catch (error) {
    console.error('Cleanup error:', error);
    return NextResponse.json({ success: false });
  }
}

