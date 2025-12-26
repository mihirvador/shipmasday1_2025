'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, Grid } from '@react-three/drei';
import { Suspense, useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { useAppStore } from '@/lib/store';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';

interface ModelProps {
  url: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  id: string;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (position: [number, number, number], rotation: [number, number, number]) => void;
}

function Model({ url, position, rotation, scale, id, isSelected, onSelect, onUpdate }: ModelProps) {
  const meshRef = useRef<THREE.Group>(null);
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modelScale, setModelScale] = useState<number>(1);

  useEffect(() => {
    const loadModel = async () => {
      try {
        console.log('Loading model:', url.substring(0, 100) + '...');
        
        // Check if it's a data URL (base64)
        const isDataUrl = url.startsWith('data:');
        
        // Determine format from URL or data URL
        let format = 'unknown';
        if (isDataUrl) {
          // Data URLs from our API are PLY by default
          format = 'ply';
        } else {
          const extension = url.split('.').pop()?.toLowerCase();
          format = extension || 'unknown';
        }
        
        console.log('Detected format:', format, 'isDataUrl:', isDataUrl);

        if (format === 'obj') {
          const loader = new OBJLoader();
          loader.load(
            url,
            (obj) => {
              obj.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  const geo = child.geometry;
                  geo.computeBoundingBox();
                  geo.center();
                  setGeometry(geo);
                  console.log('OBJ loaded successfully');
                }
              });
            },
            undefined,
            (err) => {
              console.error('OBJ load error:', err);
              setError('Failed to load OBJ');
            }
          );
        } else if (format === 'ply') {
          const loader = new PLYLoader();
          
          if (isDataUrl) {
            // Handle base64 data URL
            try {
              const base64Data = url.split(',')[1];
              if (!base64Data) {
                throw new Error('No base64 data found in URL');
              }
              
              console.log('Decoding base64 data, length:', base64Data.length);
              const binaryString = atob(base64Data);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              
              console.log('Parsing PLY data, byte length:', bytes.length);
              const geo = loader.parse(bytes.buffer);
              
              // Check if geometry has vertices
              const posAttr = geo.getAttribute('position');
              if (!posAttr || posAttr.count === 0) {
                console.error('PLY geometry has no vertices');
                setError('PLY has no geometry');
                return;
              }
              
              console.log('PLY parsed, vertex count:', posAttr.count);
              
              geo.computeVertexNormals();
              geo.computeBoundingBox();
              
              // Calculate scale to normalize the model size
              const bbox = geo.boundingBox!;
              const size = new THREE.Vector3();
              bbox.getSize(size);
              const maxDim = Math.max(size.x, size.y, size.z);
              
              console.log('Model dimensions:', size.x, size.y, size.z, 'max:', maxDim);
              
              // Scale to fit in a 2-unit box
              const normalizeScale = maxDim > 0 ? 2 / maxDim : 1;
              setModelScale(normalizeScale);
              
              geo.center();
              setGeometry(geo);
              console.log('PLY loaded successfully with scale:', normalizeScale);
            } catch (e) {
              console.error('Error parsing PLY data URL:', e);
              setError('Failed to parse PLY data');
            }
          } else {
            loader.load(
              url,
              (geo) => {
                geo.computeVertexNormals();
                geo.computeBoundingBox();
                
                const bbox = geo.boundingBox!;
                const size = new THREE.Vector3();
                bbox.getSize(size);
                const maxDim = Math.max(size.x, size.y, size.z);
                const normalizeScale = maxDim > 0 ? 2 / maxDim : 1;
                setModelScale(normalizeScale);
                
                geo.center();
                setGeometry(geo);
                console.log('PLY loaded from URL, vertex count:', geo.getAttribute('position')?.count);
              },
              undefined,
              (err) => {
                console.error('PLY load error:', err);
                setError('Failed to load PLY');
              }
            );
          }
        } else {
          console.error('Unsupported format:', format);
          setError('Unsupported file format');
        }
      } catch (e) {
        console.error('Model load error:', e);
        setError('Failed to load model');
      }
    };

    loadModel();
  }, [url]);

  if (error) {
    console.log('Rendering error state for model:', id, error);
    return (
      <group position={position}>
        <mesh onClick={onSelect}>
          <boxGeometry args={[0.5, 0.5, 0.5]} />
          <meshStandardMaterial color="#ff4444" />
        </mesh>
        {/* Error indicator */}
        <mesh position={[0, 0.5, 0]}>
          <sphereGeometry args={[0.1, 8, 8]} />
          <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={0.5} />
        </mesh>
      </group>
    );
  }

  if (!geometry) {
    return (
      <group position={position}>
        {/* Loading spinner placeholder */}
        <mesh rotation={[0, Date.now() * 0.001, 0]}>
          <torusGeometry args={[0.3, 0.05, 8, 16]} />
          <meshStandardMaterial color="#4fc3f7" wireframe />
        </mesh>
      </group>
    );
  }

  // Combine user scale with normalization scale
  const finalScale: [number, number, number] = [
    scale[0] * modelScale,
    scale[1] * modelScale,
    scale[2] * modelScale,
  ];

  // Check if geometry has vertex colors (Shap-E PLY files usually do)
  const hasVertexColors = geometry.hasAttribute('color');
  console.log('Has vertex colors:', hasVertexColors);

  return (
    <group ref={meshRef} position={position} rotation={rotation} scale={finalScale}>
      <mesh
        geometry={geometry}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <meshStandardMaterial
          color={isSelected ? '#00ff88' : '#ffffff'}
          vertexColors={hasVertexColors}
          metalness={0.1}
          roughness={0.6}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Add wireframe overlay when selected for better visibility */}
      {isSelected && (
        <mesh geometry={geometry}>
          <meshBasicMaterial color="#00ff88" wireframe transparent opacity={0.3} />
        </mesh>
      )}
    </group>
  );
}

function GiftBox({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position}>
      {/* Main box */}
      <mesh>
        <boxGeometry args={[scale, scale * 0.8, scale]} />
        <meshStandardMaterial color="#e74c3c" metalness={0.2} roughness={0.8} />
      </mesh>
      {/* Ribbon horizontal */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[scale * 1.02, scale * 0.1, scale * 0.1]} />
        <meshStandardMaterial color="#f1c40f" metalness={0.5} roughness={0.3} />
      </mesh>
      {/* Ribbon vertical */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[scale * 0.1, scale * 0.82, scale * 0.1]} />
        <meshStandardMaterial color="#f1c40f" metalness={0.5} roughness={0.3} />
      </mesh>
      {/* Bow */}
      <group position={[0, scale * 0.45, 0]}>
        <mesh rotation={[0, 0, Math.PI / 4]}>
          <torusGeometry args={[scale * 0.15, scale * 0.03, 8, 16]} />
          <meshStandardMaterial color="#f1c40f" metalness={0.5} roughness={0.3} />
        </mesh>
        <mesh rotation={[0, 0, -Math.PI / 4]}>
          <torusGeometry args={[scale * 0.15, scale * 0.03, 8, 16]} />
          <meshStandardMaterial color="#f1c40f" metalness={0.5} roughness={0.3} />
        </mesh>
      </group>
    </group>
  );
}

interface Scene3DProps {
  showGiftPreview?: boolean;
  viewOnly?: boolean;
  objects?: Array<{
    id: string;
    url: string;
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
  }>;
}

export default function Scene3D({ showGiftPreview = false, viewOnly = false, objects: propObjects }: Scene3DProps) {
  const { sceneObjects, selectedObjectId, setSelectedObjectId, updateSceneObject } = useAppStore();
  const displayObjects = propObjects || sceneObjects;

  const handleObjectUpdate = (id: string, position: [number, number, number], rotation: [number, number, number]) => {
    if (!viewOnly) {
      updateSceneObject(id, { position, rotation });
    }
  };

  return (
    <div className="w-full h-full bg-gradient-to-b from-slate-900 to-slate-950 rounded-2xl overflow-hidden">
      <Canvas shadows camera={{ position: [4, 3, 4], fov: 50, near: 0.1, far: 1000 }}>
        <ambientLight intensity={0.6} />
        <directionalLight
          position={[5, 10, 5]}
          intensity={1}
          castShadow
          shadow-mapSize={[2048, 2048]}
        />
        <pointLight position={[-5, 5, -5]} intensity={0.5} color="#4fc3f7" />
        
        <Suspense fallback={null}>
          {showGiftPreview ? (
            <GiftBox position={[0, 0.4, 0]} scale={1.5} />
          ) : (
            displayObjects.map((obj) => (
              <Model
                key={obj.id}
                id={obj.id}
                url={obj.url}
                position={obj.position}
                rotation={obj.rotation}
                scale={obj.scale}
                isSelected={selectedObjectId === obj.id}
                onSelect={() => !viewOnly && setSelectedObjectId(obj.id)}
                onUpdate={(pos, rot) => handleObjectUpdate(obj.id, pos, rot)}
              />
            ))
          )}
        </Suspense>

        <Grid
          infiniteGrid
          cellSize={0.5}
          cellThickness={0.5}
          sectionSize={2}
          sectionThickness={1}
          fadeDistance={30}
          cellColor="#334155"
          sectionColor="#475569"
        />

        <Environment preset="city" />
        
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.05}
          minDistance={1}
          maxDistance={20}
        />
      </Canvas>
    </div>
  );
}

