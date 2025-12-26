import { NextRequest, NextResponse } from 'next/server';
import { backendFetch, isBackendConfigured } from '@/lib/backend';

interface GiftObject {
  url: string;
  format?: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

interface GiftResponse {
  id: string;
  creator_id: string;
  recipient_id?: string;
  name: string;
  prompt?: string;
  model_url?: string;
  objects: GiftObject[];
  wrapped: boolean;
  status: string;
  created_at: string;
  claimed_at?: string;
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
      // Demo mode
      return NextResponse.json({ gifts: [] });
    }

    const { data, error, status } = await backendFetch<GiftResponse[]>(
      `/api/gifts/received/${userId}`,
      { method: 'GET' }
    );

    if (error) {
      console.error('Backend get received gifts error:', error);
      return NextResponse.json(
        { error: error || 'Failed to get received gifts' },
        { status: status || 500 }
      );
    }

    return NextResponse.json({ gifts: data || [] });
  } catch (error) {
    console.error('Get received gifts error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
