'use client';

import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { v4 as uuidv4 } from 'uuid';

interface SidebarProps {
  onWrapGift: () => void;
}

export default function Sidebar({ onWrapGift }: SidebarProps) {
  const [prompt, setPrompt] = useState('');
  const { 
    sceneObjects, 
    addSceneObject, 
    removeSceneObject,
    selectedObjectId,
    setSelectedObjectId,
    isGenerating,
    setIsGenerating,
    generationProgress,
    setGenerationProgress,
    updateSceneObject
  } = useAppStore();

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;

    setIsGenerating(true);
    setGenerationProgress(0);

    try {
      // Simulate progress while waiting
      const progressInterval = setInterval(() => {
        setGenerationProgress((prev) => Math.min(prev + Math.random() * 10, 90));
      }, 500);

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        throw new Error('Generation failed');
      }

      const data = await response.json();
      setGenerationProgress(100);

      // Add the generated model to the scene
      const newObject = {
        id: uuidv4(),
        name: prompt.slice(0, 30),
        url: data.modelUrl,
        position: [0, 0.5, 0] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        scale: [1, 1, 1] as [number, number, number],
        prompt: prompt,  // Store the original prompt
        modelData: data.modelData,  // Store base64 data for wrapping
      };

      addSceneObject(newObject);
      setSelectedObjectId(newObject.id);
      setPrompt('');
    } catch (error) {
      console.error('Generation error:', error);
      alert('Failed to generate model. Please try again.');
    } finally {
      setIsGenerating(false);
      setGenerationProgress(0);
    }
  };

  const selectedObject = sceneObjects.find(obj => obj.id === selectedObjectId);

  return (
    <div className="w-80 h-full bg-slate-900/95 backdrop-blur-xl border-l border-slate-700/50 flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-slate-700/50">
        <h2 className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
          Gift Creator
        </h2>
        <p className="text-sm text-slate-400 mt-1">Generate 3D objects with AI</p>
      </div>

      {/* Generate Section */}
      <div className="p-4 border-b border-slate-700/50">
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Describe your object
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g., A cute teddy bear with a bow tie..."
          className="w-full h-24 px-4 py-3 bg-slate-800/80 border border-slate-600/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 resize-none transition-all"
          disabled={isGenerating}
        />
        
        <button
          onClick={handleGenerate}
          disabled={!prompt.trim() || isGenerating}
          className="w-full mt-3 py-3 px-4 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 disabled:from-slate-600 disabled:to-slate-600 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
        >
          {isGenerating ? (
            <>
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>Generating... {Math.round(generationProgress)}%</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>Generate 3D Model</span>
            </>
          )}
        </button>

        {isGenerating && (
          <div className="mt-3 h-2 bg-slate-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all duration-300"
              style={{ width: `${generationProgress}%` }}
            />
          </div>
        )}
      </div>

      {/* Objects List */}
      <div className="flex-1 overflow-y-auto p-4">
        <h3 className="text-sm font-medium text-slate-400 mb-3">Scene Objects ({sceneObjects.length})</h3>
        
        {sceneObjects.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-800/50 flex items-center justify-center">
              <svg className="w-8 h-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <p className="text-slate-500 text-sm">No objects yet</p>
            <p className="text-slate-600 text-xs mt-1">Generate your first 3D model above</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sceneObjects.map((obj) => (
              <div
                key={obj.id}
                onClick={() => setSelectedObjectId(obj.id)}
                className={`p-3 rounded-xl cursor-pointer transition-all ${
                  selectedObjectId === obj.id
                    ? 'bg-emerald-500/20 border border-emerald-500/50'
                    : 'bg-slate-800/50 border border-transparent hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-200 truncate flex-1">{obj.name}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSceneObject(obj.id);
                      if (selectedObjectId === obj.id) setSelectedObjectId(null);
                    }}
                    className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Selected Object Controls */}
      {selectedObject && (
        <div className="p-4 border-t border-slate-700/50 bg-slate-800/50">
          <h3 className="text-sm font-medium text-slate-300 mb-3">Transform</h3>
          
          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-400">Position</label>
              <div className="grid grid-cols-3 gap-2 mt-1">
                {['X', 'Y', 'Z'].map((axis, i) => (
                  <div key={axis} className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-500">{axis}</span>
                    <input
                      type="number"
                      step="0.1"
                      value={selectedObject.position[i].toFixed(1)}
                      onChange={(e) => {
                        const newPos = [...selectedObject.position] as [number, number, number];
                        newPos[i] = parseFloat(e.target.value) || 0;
                        updateSceneObject(selectedObject.id, { position: newPos });
                      }}
                      className="w-full pl-6 pr-2 py-1.5 bg-slate-700/50 border border-slate-600/50 rounded-lg text-white text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-400">Scale</label>
              <div className="grid grid-cols-3 gap-2 mt-1">
                {['X', 'Y', 'Z'].map((axis, i) => (
                  <div key={axis} className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-500">{axis}</span>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={selectedObject.scale[i].toFixed(1)}
                      onChange={(e) => {
                        const newScale = [...selectedObject.scale] as [number, number, number];
                        newScale[i] = Math.max(0.1, parseFloat(e.target.value) || 0.1);
                        updateSceneObject(selectedObject.id, { scale: newScale });
                      }}
                      className="w-full pl-6 pr-2 py-1.5 bg-slate-700/50 border border-slate-600/50 rounded-lg text-white text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Wrap Gift Button */}
      <div className="p-4 border-t border-slate-700/50">
        <button
          onClick={onWrapGift}
          disabled={sceneObjects.length === 0}
          className="w-full py-3 px-4 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-400 hover:to-pink-400 disabled:from-slate-600 disabled:to-slate-600 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 shadow-lg shadow-rose-500/20"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
          </svg>
          <span>Wrap as Gift</span>
        </button>
      </div>
    </div>
  );
}

