import { NextRequest, NextResponse } from 'next/server';
import { backendFetch, isBackendConfigured } from '@/lib/backend';

interface GiftResponse {
  id: string;
  creator_id: string;
  name: string;
  objects: Array<{
    url: string;
    position: number[];
    rotation: number[];
    scale: number[];
  }>;
  wrapped: boolean;
  status: string;
  created_at: string;
  creator_email?: string;
}

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    // Input validation
    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    if (!UUID_REGEX.test(userId)) {
      return NextResponse.json(
        { error: 'Invalid userId format' },
        { status: 400 }
      );
    }

    if (!isBackendConfigured()) {
      // Demo mode - return a sample gift
      return NextResponse.json({
        gift: {
          id: 'sample-demo-gift',
          creator_id: 'other-user',
          name: 'Sample Mystery Gift',
          objects: [
            {
              url: '/demo-models/cube.obj',
              position: [0, 0.5, 0],
              rotation: [0, 0, 0],
              scale: [1, 1, 1],
            },
          ],
          wrapped: true,
          status: 'in_pool',
          created_at: new Date().toISOString(),
          creator_email: 'demo@example.com',
        },
      });
    }

    const { data, error, status } = await backendFetch<GiftResponse | null>(
      `/api/gifts/pool?user_id=${userId}`,
      { method: 'GET' }
    );

    if (error) {
      console.error('Backend pool error:', error);
      return NextResponse.json(
        { error: error || 'Failed to get gift from pool' },
        { status: status || 500 }
      );
    }

    return NextResponse.json({ gift: data });
  } catch (error) {
    console.error('Get pool gift error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
