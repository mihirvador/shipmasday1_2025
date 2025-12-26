'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useAppStore } from '@/lib/store';
import Sidebar from '@/components/Sidebar';
import WrapGiftModal from '@/components/WrapGiftModal';

const Scene3D = dynamic(() => import('@/components/Scene3D'), { ssr: false });

export default function StudioPage() {
  const [showWrapModal, setShowWrapModal] = useState(false);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const { user, sceneObjects } = useAppStore();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !user) {
      router.push('/');
    }
  }, [mounted, user, router]);

  if (!mounted || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-950 overflow-hidden">
      {/* Header */}
      <header className="h-16 flex items-center justify-between px-6 border-b border-slate-800/50 bg-slate-900/50 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="h-8 w-px bg-slate-700" />
          <h1 className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            Gift Studio
          </h1>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-400">
            {user.email}
          </span>
          <button
            onClick={() => router.push('/my-gifts')}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
            <span>My Gifts</span>
          </button>
          <button
            onClick={() => router.push('/unwrap')}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-400 hover:to-pink-400 text-white rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
            </svg>
            <span>Unwrap</span>
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* 3D Viewer */}
        <div className="flex-1 p-4">
          <div className="h-full relative">
            <Scene3D />
            
            {/* Controls hint */}
            <div className="absolute bottom-4 left-4 bg-slate-900/90 backdrop-blur-sm rounded-xl p-3 border border-slate-700/50">
              <div className="flex gap-4 text-xs text-slate-500">
                <span><span className="text-slate-400">Drag:</span> Rotate</span>
                <span><span className="text-slate-400">Right-drag:</span> Pan</span>
                <span><span className="text-slate-400">Scroll:</span> Zoom</span>
              </div>
            </div>

            {/* Gift ready indicator */}
            {sceneObjects.length > 0 && (
              <div className="absolute top-4 left-4 bg-emerald-500/20 backdrop-blur-sm rounded-xl px-4 py-2 border border-emerald-500/50">
                <span className="text-sm text-emerald-400 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Gift ready to wrap!
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <Sidebar onWrapGift={() => setShowWrapModal(true)} />
      </div>

      {/* Wrap Gift Modal */}
      <WrapGiftModal 
        isOpen={showWrapModal} 
        onClose={() => setShowWrapModal(false)} 
      />
    </div>
  );
}


