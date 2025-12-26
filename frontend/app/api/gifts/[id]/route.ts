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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: giftId } = await params;

    // Input validation
    if (!giftId) {
      return NextResponse.json(
        { error: 'Gift ID is required' },
        { status: 400 }
      );
    }

    if (!UUID_REGEX.test(giftId)) {
      return NextResponse.json(
        { error: 'Invalid gift ID format' },
        { status: 400 }
      );
    }

    if (!isBackendConfigured()) {
      // Demo mode
      return NextResponse.json({
        gift: {
          id: giftId,
          creator_id: 'demo-user',
          name: 'Demo Gift',
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

    const { data, error, status } = await backendFetch<GiftResponse>(
      `/api/gifts/${giftId}`,
      { method: 'GET' }
    );

    if (error || !data) {
      if (status === 404) {
        return NextResponse.json(
          { error: 'Gift not found' },
          { status: 404 }
        );
      }
      
      console.error('Backend get gift error:', error);
      return NextResponse.json(
        { error: error || 'Failed to get gift' },
        { status: status || 500 }
      );
    }

    return NextResponse.json({ gift: data });
  } catch (error) {
    console.error('Get gift error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
