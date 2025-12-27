import { NextRequest, NextResponse } from 'next/server';
import { backendFetch, isBackendConfigured } from '@/lib/backend';

interface WrapResponse {
  id: string;
  creator_id: string;
  name: string;
  status: string;
  created_at: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // Note: modelData is no longer passed - the model URL is already in objects[0].url
    const { userId, name, prompt, objects } = body;

    // Input validation
    if (!userId || typeof userId !== 'string') {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { error: 'name is required' },
        { status: 400 }
      );
    }

    if (name.length > 200) {
      return NextResponse.json(
        { error: 'Name too long (max 200 characters)' },
        { status: 400 }
      );
    }

    if (!isBackendConfigured()) {
      // Demo mode
      console.log('Demo mode: Gift wrapped', { userId, name });
      return NextResponse.json({
        success: true,
        gift: {
          id: `demo-gift-${Date.now()}`,
          creator_id: userId,
          name,
          status: 'in_pool',
          created_at: new Date().toISOString(),
        },
      });
    }

    // Get model URL from objects - it's already stored in Supabase storage
    const modelUrl = objects?.[0]?.url;

    const { data, error, status } = await backendFetch<WrapResponse>(
      '/api/gifts/wrap',
      {
        method: 'POST',
        body: {
          user_id: userId,
          name: name.trim(),
          prompt: prompt?.trim(),
          model_url: modelUrl,
          objects: objects || [],
        },
      }
    );

    if (error || !data) {
      console.error('Backend wrap error:', error);
      return NextResponse.json(
        { error: error || 'Failed to wrap gift' },
        { status: status || 500 }
      );
    }

    return NextResponse.json({ success: true, gift: data });
  } catch (error) {
    console.error('Wrap gift error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
