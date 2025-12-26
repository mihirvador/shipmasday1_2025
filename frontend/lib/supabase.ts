import type { Gift, GiftObject } from '@/types/database';

// Demo user for when backend is not configured
const demoUser = {
  id: 'demo-user-id',
  email: 'demo@example.com',
  created_at: new Date().toISOString(),
};

// Demo gifts storage (in-memory for demo mode)
const demoGifts: Map<string, Gift & { creator_email?: string }> = new Map();
const demoOpenings: Map<string, { gift_id: string; opener_id: string }> = new Map();

/**
 * Check if we're in demo mode (no backend configured)
 */
export function isDemoMode(): boolean {
  // In client-side, we can't access env vars directly
  // The API routes will handle demo mode fallback
  return false;
}

/**
 * Create or get a user by email via the backend API
 */
export async function getOrCreateUser(email: string) {
  try {
    const response = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      console.error('Failed to create/get user');
      return { ...demoUser, email };
    }

    const data = await response.json();
    return data.user;
  } catch (error) {
    console.error('Error creating/getting user:', error);
    return { ...demoUser, email };
  }
}

/**
 * Create a gift via the backend API
 */
export async function createGift(
  userId: string,
  name: string,
  objects: { url: string; format?: string; position: number[]; rotation: number[]; scale: number[] }[],
  prompt?: string,
  modelData?: string
) {
  try {
    const response = await fetch('/api/gifts/wrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        name,
        prompt,
        modelData,
        objects,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to wrap gift');
    }

    const data = await response.json();
    return data.gift;
  } catch (error) {
    console.error('Error creating gift:', error);
    // Fallback to demo - cast objects to proper GiftObject type
    const giftObjects: GiftObject[] = objects.map(obj => ({
      url: obj.url,
      format: obj.format,
      position: obj.position as [number, number, number],
      rotation: obj.rotation as [number, number, number],
      scale: obj.scale as [number, number, number],
    }));
    const gift: Gift & { creator_email?: string } = {
      id: `demo-gift-${Date.now()}`,
      creator_id: userId,
      name,
      objects: giftObjects,
      wrapped: true,
      created_at: new Date().toISOString(),
    };
    demoGifts.set(gift.id, gift);
    return gift;
  }
}

/**
 * Get an available gift from the pool for a user
 */
export async function getAvailableGift(userId: string) {
  try {
    const response = await fetch(`/api/gifts/pool?userId=${userId}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      console.error('Failed to get gift from pool');
      return null;
    }

    const data = await response.json();
    return data.gift;
  } catch (error) {
    console.error('Error getting available gift:', error);
    // Return a demo gift
    const gifts = Array.from(demoGifts.values()).filter(
      (g) => g.creator_id !== userId && !demoOpenings.has(`${g.id}-${userId}`)
    );
    if (gifts.length === 0) {
      return {
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
      };
    }
    return gifts[Math.floor(Math.random() * gifts.length)];
  }
}

/**
 * Claim a gift from the pool
 */
export async function claimGift(giftId: string, userId: string) {
  try {
    const response = await fetch('/api/gifts/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, giftId }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to claim gift');
    }

    const data = await response.json();
    return data.gift;
  } catch (error) {
    console.error('Error claiming gift:', error);
    throw error;
  }
}

/**
 * Record a gift opening (legacy - now handled by claim)
 */
export async function recordGiftOpening(giftId: string, openerId: string) {
  // This is now handled by the claim endpoint
  // Keeping for backward compatibility
  demoOpenings.set(`${giftId}-${openerId}`, {
    gift_id: giftId,
    opener_id: openerId,
  });
  return { gift_id: giftId, opener_id: openerId };
}

/**
 * Get a gift by ID
 */
export async function getGiftById(giftId: string) {
  try {
    const response = await fetch(`/api/gifts/${giftId}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      console.error('Failed to get gift');
      return null;
    }

    const data = await response.json();
    
    // Map the response to include 'users' field for backward compatibility
    if (data.gift) {
      return {
        ...data.gift,
        users: data.gift.creator_email ? { email: data.gift.creator_email } : null,
      };
    }
    return null;
  } catch (error) {
    console.error('Error getting gift:', error);
    // Return demo gift
    const gift = demoGifts.get(giftId);
    if (gift) {
      return { ...gift, users: { email: gift.creator_email || 'demo@example.com' } };
    }
    return {
      id: giftId,
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
      users: { email: 'demo@example.com' },
    };
  }
}

/**
 * Get gifts created by a user
 */
export async function getCreatedGifts(userId: string) {
  try {
    const response = await fetch(`/api/gifts/created?userId=${userId}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      console.error('Failed to get created gifts');
      return [];
    }

    const data = await response.json();
    return data.gifts || [];
  } catch (error) {
    console.error('Error getting created gifts:', error);
    return Array.from(demoGifts.values()).filter((g) => g.creator_id === userId);
  }
}

/**
 * Get gifts received by a user
 */
export async function getReceivedGifts(userId: string) {
  try {
    const response = await fetch(`/api/gifts/received?userId=${userId}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      console.error('Failed to get received gifts');
      return [];
    }

    const data = await response.json();
    return data.gifts || [];
  } catch (error) {
    console.error('Error getting received gifts:', error);
    return [];
  }
}

// Legacy export for backward compatibility
export const supabase = null;
