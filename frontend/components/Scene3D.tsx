'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls, TransformControls, Environment, Grid, useGLTF, PerspectiveCamera } from '@react-three/drei';
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

  useEffect(() => {
    const loadModel = async () => {
      try {
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

        if (format === 'obj') {
          const loader = new OBJLoader();
          loader.load(
            url,
            (obj) => {
              obj.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  setGeometry(child.geometry);
                }
              });
            },
            undefined,
            () => setError('Failed to load OBJ')
          );
        } else if (format === 'ply') {
          const loader = new PLYLoader();
          
          if (isDataUrl) {
            // Handle base64 data URL
            try {
              const base64Data = url.split(',')[1];
              const binaryString = atob(base64Data);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              const geo = loader.parse(bytes.buffer);
              geo.computeVertexNormals();
              // Center and scale the geometry
              geo.computeBoundingBox();
              geo.center();
              setGeometry(geo);
            } catch (e) {
              console.error('Error parsing PLY data URL:', e);
              setError('Failed to parse PLY data');
            }
          } else {
            loader.load(
              url,
              (geo) => {
                geo.computeVertexNormals();
                geo.center();
                setGeometry(geo);
              },
              undefined,
              () => setError('Failed to load PLY')
            );
          }
        } else {
          // For GLTF/GLB files, we'd use useGLTF
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
    return (
      <mesh position={position} onClick={onSelect}>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshStandardMaterial color="red" />
      </mesh>
    );
  }

  if (!geometry) {
    return (
      <mesh position={position}>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshStandardMaterial color="#888" wireframe />
      </mesh>
    );
  }

  return (
    <group ref={meshRef} position={position} rotation={rotation} scale={scale}>
      <mesh
        geometry={geometry}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <meshStandardMaterial
          color={isSelected ? '#00ff88' : '#ffffff'}
          metalness={0.3}
          roughness={0.5}
        />
      </mesh>
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
      <Canvas shadows>
        <PerspectiveCamera makeDefault position={[3, 3, 3]} fov={50} />
        
        <ambientLight intensity={0.4} />
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

