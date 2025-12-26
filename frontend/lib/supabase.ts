import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Create client only if we have valid credentials
let supabase: SupabaseClient<Database> | null = null;

if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
}

export { supabase };

// Demo mode check
export function isDemoMode() {
  return !supabaseUrl || !supabaseAnonKey;
}

// Demo user for when Supabase is not configured
const demoUser = {
  id: 'demo-user-id',
  email: 'demo@example.com',
  created_at: new Date().toISOString(),
};

// Demo gifts storage (in-memory for demo mode)
const demoGifts: Map<string, any> = new Map();
const demoOpenings: Map<string, any> = new Map();

export async function getOrCreateUser(email: string) {
  if (isDemoMode()) {
    console.log('Running in demo mode - Supabase not configured');
    return { ...demoUser, email };
  }

  // Check if user exists
  const { data: existingUser } = await supabase!
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  if (existingUser) {
    return existingUser;
  }

  // Create new user
  const { data: newUser, error } = await supabase!
    .from('users')
    .insert({ email })
    .select()
    .single();

  if (error) throw error;
  return newUser;
}

export async function uploadGiftFile(
  userId: string,
  giftId: string,
  file: Blob,
  fileName: string
) {
  if (isDemoMode()) {
    // Return a mock URL in demo mode
    return `/demo-files/${giftId}/${fileName}`;
  }

  const filePath = `${userId}/${giftId}/${fileName}`;
  const bucket = process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'gifts';

  const { data, error } = await supabase!.storage
    .from(bucket)
    .upload(filePath, file, {
      contentType: 'application/octet-stream',
      upsert: true,
    });

  if (error) throw error;

  const { data: urlData } = supabase!.storage
    .from(bucket)
    .getPublicUrl(filePath);

  return urlData.publicUrl;
}

export async function createGift(
  userId: string,
  name: string,
  objects: { url: string; position: number[]; rotation: number[]; scale: number[] }[]
) {
  if (isDemoMode()) {
    const gift = {
      id: `demo-gift-${Date.now()}`,
      creator_id: userId,
      name,
      objects,
      wrapped: true,
      created_at: new Date().toISOString(),
    };
    demoGifts.set(gift.id, gift);
    console.log('Demo mode: Gift created', gift);
    return gift;
  }

  const { data, error } = await supabase!
    .from('gifts')
    .insert({
      creator_id: userId,
      name,
      objects,
      wrapped: true,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getAvailableGift(userId: string) {
  if (isDemoMode()) {
    // Return a demo gift
    const gifts = Array.from(demoGifts.values()).filter(
      (g) => g.creator_id !== userId && !demoOpenings.has(`${g.id}-${userId}`)
    );
    if (gifts.length === 0) {
      // Create a sample demo gift
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
        created_at: new Date().toISOString(),
      };
    }
    return gifts[Math.floor(Math.random() * gifts.length)];
  }

  // Get a random gift that wasn't created by this user and hasn't been opened by them
  const { data: openedGifts } = await supabase!
    .from('gift_openings')
    .select('gift_id')
    .eq('opener_id', userId);

  const openedIds = openedGifts?.map((g) => g.gift_id) || [];

  let query = supabase!
    .from('gifts')
    .select('*')
    .neq('creator_id', userId);

  if (openedIds.length > 0) {
    query = query.not('id', 'in', `(${openedIds.join(',')})`);
  }

  const { data: gifts } = await query;

  if (!gifts || gifts.length === 0) return null;

  // Return random gift
  return gifts[Math.floor(Math.random() * gifts.length)];
}

export async function recordGiftOpening(giftId: string, openerId: string) {
  if (isDemoMode()) {
    const opening = {
      id: `demo-opening-${Date.now()}`,
      gift_id: giftId,
      opener_id: openerId,
      opened_at: new Date().toISOString(),
    };
    demoOpenings.set(`${giftId}-${openerId}`, opening);
    console.log('Demo mode: Gift opening recorded', opening);
    return opening;
  }

  const { data, error } = await supabase!
    .from('gift_openings')
    .insert({
      gift_id: giftId,
      opener_id: openerId,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getGiftById(giftId: string) {
  if (isDemoMode()) {
    const gift = demoGifts.get(giftId);
    if (gift) {
      return { ...gift, users: { email: 'creator@demo.com' } };
    }
    // Return sample gift
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
      created_at: new Date().toISOString(),
      users: { email: 'creator@demo.com' },
    };
  }

  const { data, error } = await supabase!
    .from('gifts')
    .select('*, users!gifts_creator_id_fkey(email)')
    .eq('id', giftId)
    .single();

  if (error) throw error;
  return data;
}
