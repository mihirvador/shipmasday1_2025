import { NextRequest, NextResponse } from 'next/server';
import { backendFetch, isBackendConfigured } from '@/lib/backend';

interface GiftResponse {
  id: string;
  recipient_id?: string;
  status: string;
  wrapped: boolean;
}

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, giftId } = body;

    // Input validation
    if (!userId || !giftId) {
      return NextResponse.json(
        { error: 'userId and giftId are required' },
        { status: 400 }
      );
    }

    if (!UUID_REGEX.test(userId) || !UUID_REGEX.test(giftId)) {
      return NextResponse.json(
        { error: 'Invalid ID format' },
        { status: 400 }
      );
    }

    if (!isBackendConfigured()) {
      // Demo mode
      console.log('Demo mode: Gift claimed', { userId, giftId });
      return NextResponse.json({
        success: true,
        gift: {
          id: giftId,
          recipient_id: userId,
          status: 'claimed',
          wrapped: false,
        },
      });
    }

    const { data, error, status } = await backendFetch<GiftResponse>(
      '/api/gifts/claim',
      {
        method: 'POST',
        body: {
          user_id: userId,
          gift_id: giftId,
        },
      }
    );

    if (error || !data) {
      console.error('Backend claim error:', error);
      
      if (status === 409) {
        return NextResponse.json(
          { error: 'Gift is no longer available' },
          { status: 409 }
        );
      }
      
      return NextResponse.json(
        { error: error || 'Failed to claim gift' },
        { status: status || 500 }
      );
    }

    return NextResponse.json({ success: true, gift: data });
  } catch (error) {
    console.error('Claim gift error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
