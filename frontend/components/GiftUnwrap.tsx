'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { getAvailableGift, claimGift, getGiftById } from '@/lib/supabase';
import type { Gift, GiftObject } from '@/types/database';
import dynamic from 'next/dynamic';

const Scene3D = dynamic(() => import('./Scene3D'), { ssr: false });

type GiftWithCreator = Gift & { users: { email: string } | null };

export default function GiftUnwrap() {
  const [gift, setGift] = useState<GiftWithCreator | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUnwrapping, setIsUnwrapping] = useState(false);
  const [isUnwrapped, setIsUnwrapped] = useState(false);
  const [noGiftsAvailable, setNoGiftsAvailable] = useState(false);
  const router = useRouter();
  const { user } = useAppStore();

  useEffect(() => {
    const loadGift = async () => {
      if (!user) {
        // Allow browsing without login
        setIsLoading(false);
        return;
      }

      try {
        const availableGift = await getAvailableGift(user.id);
        if (availableGift) {
          const fullGift = await getGiftById(availableGift.id);
          setGift(fullGift);
        } else {
          setNoGiftsAvailable(true);
        }
      } catch (error) {
        console.error('Error loading gift:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadGift();
  }, [user]);

  const handleUnwrap = async () => {
    if (!gift || !user) return;

    setIsUnwrapping(true);

    // Animate unwrapping
    setTimeout(async () => {
      try {
        // Claim the gift - this assigns it to the user and marks it as opened
        await claimGift(gift.id, user.id);
        setIsUnwrapped(true);
      } catch (error) {
        console.error('Error claiming gift:', error);
        alert('Failed to claim gift. It may have already been claimed by someone else.');
      }
      setIsUnwrapping(false);
    }, 1500);
  };

  const handleFindAnother = async () => {
    if (!user) return;

    setIsUnwrapped(false);
    setIsLoading(true);
    setGift(null);

    try {
      const availableGift = await getAvailableGift(user.id);
      if (availableGift) {
        const fullGift = await getGiftById(availableGift.id);
        setGift(fullGift);
      } else {
        setNoGiftsAvailable(true);
      }
    } catch (error) {
      console.error('Error loading gift:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Finding a gift for you...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <div className="text-center max-w-md px-6">
          <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-rose-500 to-pink-500 flex items-center justify-center">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-4">Sign In to Unwrap</h1>
          <p className="text-slate-400 mb-8">Enter your email to discover mystery gifts from other creators</p>
          <button
            onClick={() => router.push('/')}
            className="px-8 py-4 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-400 hover:to-pink-400 text-white font-semibold rounded-xl transition-all"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  if (noGiftsAvailable) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <div className="text-center max-w-md px-6">
          <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-slate-800 flex items-center justify-center">
            <svg className="w-10 h-10 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-4">No Gifts Available</h1>
          <p className="text-slate-400 mb-8">There are no new gifts to unwrap right now. Why not create one?</p>
          <button
            onClick={() => router.push('/studio')}
            className="px-8 py-4 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-white font-semibold rounded-xl transition-all"
          >
            Create a Gift
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col">
      {/* Header */}
      <header className="p-4 flex items-center justify-between border-b border-slate-800/50">
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span>Back</span>
        </button>
        <h1 className="text-xl font-bold bg-gradient-to-r from-rose-400 to-pink-400 bg-clip-text text-transparent">
          Mystery Gift
        </h1>
        <button
          onClick={() => router.push('/studio')}
          className="text-slate-400 hover:text-white transition-colors"
        >
          Create Gift
        </button>
      </header>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center p-6">
        {!isUnwrapped ? (
          <div className="text-center">
            {/* Wrapped gift display */}
            <div 
              className={`relative mx-auto mb-8 cursor-pointer transition-all duration-500 ${
                isUnwrapping ? 'scale-110 animate-shake' : 'hover:scale-105'
              }`}
              onClick={!isUnwrapping ? handleUnwrap : undefined}
            >
              <div className="w-48 h-48 relative">
                <div className="absolute inset-0 bg-gradient-to-br from-rose-500 to-rose-600 rounded-2xl shadow-2xl shadow-rose-500/30" />
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-full bg-gradient-to-b from-amber-400 to-amber-500" />
                <div className="absolute top-1/2 left-0 -translate-y-1/2 w-full h-6 bg-gradient-to-r from-amber-400 to-amber-500" />
                <div className="absolute -top-6 left-1/2 -translate-x-1/2">
                  <div className="w-12 h-12 bg-amber-400 rounded-full shadow-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-amber-600" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                    </svg>
                  </div>
                </div>
                
                {isUnwrapping && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-full h-full bg-white/20 rounded-2xl animate-pulse" />
                  </div>
                )}
              </div>
            </div>

            <h2 className="text-2xl font-bold text-white mb-2">
              {gift?.name || 'A Mystery Gift'}
            </h2>
            <p className="text-slate-400 mb-6">
              From {gift?.users?.email?.split('@')[0] || 'Anonymous'}
            </p>

            <button
              onClick={handleUnwrap}
              disabled={isUnwrapping}
              className="px-8 py-4 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-400 hover:to-pink-400 disabled:from-slate-600 disabled:to-slate-600 text-white font-semibold rounded-xl transition-all shadow-lg shadow-rose-500/25"
            >
              {isUnwrapping ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Unwrapping...
                </span>
              ) : (
                'Click to Unwrap'
              )}
            </button>
          </div>
        ) : (
          <div className="w-full max-w-4xl">
            <div className="text-center mb-6">
              <h2 className="text-3xl font-bold text-white mb-2">🎉 Surprise!</h2>
              <p className="text-slate-400">Here's what was inside "{gift?.name}"</p>
            </div>

            {/* 3D Viewer showing unwrapped contents */}
            <div className="h-[500px] rounded-2xl overflow-hidden mb-6">
              <Scene3D 
                viewOnly 
                objects={gift?.objects?.map((obj: GiftObject, i: number) => ({
                  id: `obj-${i}`,
                  ...obj
                })) || []}
              />
            </div>

            <div className="flex justify-center gap-4">
              <button
                onClick={handleFindAnother}
                className="px-6 py-3 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-400 hover:to-pink-400 text-white font-semibold rounded-xl transition-all"
              >
                Find Another Gift
              </button>
              <button
                onClick={() => router.push('/studio')}
                className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl transition-all"
              >
                Create Your Own
              </button>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0) rotate(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-5px) rotate(-2deg); }
          20%, 40%, 60%, 80% { transform: translateX(5px) rotate(2deg); }
        }
        .animate-shake {
          animation: shake 0.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

