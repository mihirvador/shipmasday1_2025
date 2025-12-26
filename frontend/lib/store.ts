'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GiftObject, User, Gift } from '@/types/database';

interface SceneObject extends GiftObject {
  id: string;
  name: string;
  prompt?: string;  // Original prompt used to generate
  modelData?: string;  // Base64 encoded model data for wrapping
}

interface ReceivedGift extends Gift {
  creator_email?: string;
  received_at?: string;
}

interface AppState {
  user: User | null;
  setUser: (user: User | null) => void;
  
  sceneObjects: SceneObject[];
  addSceneObject: (obj: SceneObject) => void;
  removeSceneObject: (id: string) => void;
  updateSceneObject: (id: string, updates: Partial<SceneObject>) => void;
  clearSceneObjects: () => void;
  
  selectedObjectId: string | null;
  setSelectedObjectId: (id: string | null) => void;
  
  isGenerating: boolean;
  setIsGenerating: (value: boolean) => void;
  
  generationProgress: number;
  setGenerationProgress: (value: number) => void;
  
  // My Gifts - received gifts
  receivedGifts: ReceivedGift[];
  setReceivedGifts: (gifts: ReceivedGift[]) => void;
  addReceivedGift: (gift: ReceivedGift) => void;
  
  // Currently viewing gift
  viewingGift: ReceivedGift | null;
  setViewingGift: (gift: ReceivedGift | null) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      
      sceneObjects: [],
      addSceneObject: (obj) => set((state) => ({ 
        sceneObjects: [...state.sceneObjects, obj] 
      })),
      removeSceneObject: (id) => set((state) => ({ 
        sceneObjects: state.sceneObjects.filter((obj) => obj.id !== id) 
      })),
      updateSceneObject: (id, updates) => set((state) => ({
        sceneObjects: state.sceneObjects.map((obj) =>
          obj.id === id ? { ...obj, ...updates } : obj
        ),
      })),
      clearSceneObjects: () => set({ sceneObjects: [] }),
      
      selectedObjectId: null,
      setSelectedObjectId: (id) => set({ selectedObjectId: id }),
      
      isGenerating: false,
      setIsGenerating: (value) => set({ isGenerating: value }),
      
      generationProgress: 0,
      setGenerationProgress: (value) => set({ generationProgress: value }),
      
      // My Gifts
      receivedGifts: [],
      setReceivedGifts: (gifts) => set({ receivedGifts: gifts }),
      addReceivedGift: (gift) => set((state) => ({
        receivedGifts: [gift, ...state.receivedGifts.filter(g => g.id !== gift.id)]
      })),
      
      viewingGift: null,
      setViewingGift: (gift) => set({ viewingGift: gift }),
    }),
    {
      name: 'gift-app-storage',
      partialize: (state) => ({ user: state.user }),
    }
  )
);

