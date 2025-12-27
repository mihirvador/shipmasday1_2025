'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { createGift } from '@/lib/supabase';

interface WrapGiftModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function WrapGiftModal({ isOpen, onClose }: WrapGiftModalProps) {
  const [giftName, setGiftName] = useState('');
  const [isWrapping, setIsWrapping] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const router = useRouter();
  const { user, sceneObjects, clearSceneObjects } = useAppStore();

  const handleWrap = async () => {
    if (!user || !giftName.trim()) return;

    setIsWrapping(true);

    try {
      // Create the gift in the database
      const giftObjects = sceneObjects.map(obj => ({
        url: obj.url,
        format: obj.format || 'glb',  // Include format for proper 3D loading
        position: obj.position,
        rotation: obj.rotation,
        scale: obj.scale,
      }));

      // Get the first object's prompt for the gift
      // Note: modelData is no longer needed - the model is already stored in Supabase storage
      // and the URL is in giftObjects[0].url
      const firstObject = sceneObjects[0];
      const prompt = firstObject?.prompt;

      await createGift(user.id, giftName, giftObjects, prompt);

      setShowSuccess(true);

      // After success animation, redirect
      setTimeout(() => {
        clearSceneObjects();
        router.push('/unwrap');
      }, 2000);
    } catch (error) {
      console.error('Error wrapping gift:', error);
      alert('Failed to wrap gift. Please try again.');
      setIsWrapping(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={!isWrapping ? onClose : undefined}
      />

      {/* Modal */}
      <div className="relative bg-slate-900 rounded-3xl p-8 w-full max-w-md mx-4 border border-slate-700/50 shadow-2xl">
        {showSuccess ? (
          <div className="text-center py-8">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center animate-bounce">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">Gift Wrapped!</h3>
            <p className="text-slate-400">Your gift is ready to be discovered...</p>
          </div>
        ) : (
          <>
            {/* Close button */}
            <button
              onClick={onClose}
              disabled={isWrapping}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Gift preview */}
            <div className="flex justify-center mb-6">
              <div className="relative">
                <div className="w-24 h-24 bg-gradient-to-br from-rose-500 to-rose-600 rounded-xl shadow-xl transform rotate-3 transition-transform hover:rotate-0">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-full bg-gradient-to-b from-amber-400 to-amber-500" />
                  <div className="absolute top-1/2 left-0 -translate-y-1/2 w-full h-3 bg-gradient-to-r from-amber-400 to-amber-500" />
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <div className="w-6 h-6 bg-amber-400 rounded-full shadow" />
                  </div>
                </div>
                <div className="absolute -bottom-2 -right-2 bg-slate-800 rounded-full px-3 py-1 border border-slate-600">
                  <span className="text-sm text-emerald-400 font-medium">{sceneObjects.length} items</span>
                </div>
              </div>
            </div>

            {/* Title */}
            <h3 className="text-2xl font-bold text-white text-center mb-2">
              Wrap Your Gift
            </h3>
            <p className="text-slate-400 text-center mb-6">
              Give your gift a name and send it into the world
            </p>

            {/* Gift name input */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Gift Name
              </label>
              <input
                type="text"
                value={giftName}
                onChange={(e) => setGiftName(e.target.value)}
                placeholder="My Special Gift..."
                className="w-full px-4 py-3 bg-slate-800/80 border border-slate-600/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/50 focus:border-rose-500/50 transition-all"
                disabled={isWrapping}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                disabled={isWrapping}
                className="flex-1 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleWrap}
                disabled={!giftName.trim() || isWrapping}
                className="flex-1 py-3 px-4 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-400 hover:to-pink-400 disabled:from-slate-600 disabled:to-slate-600 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
              >
                {isWrapping ? (
                  <>
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>Wrapping...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                    </svg>
                    <span>Wrap Gift</span>
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

