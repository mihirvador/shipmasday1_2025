"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, Grid } from "@react-three/drei";
import {
	Suspense,
	useRef,
	useEffect,
	useState,
	useMemo,
	useCallback,
} from "react";
import * as THREE from "three";
import { useAppStore } from "@/lib/store";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";

// Convert base64 data URL to Blob URL (more memory efficient)
function dataURLtoBlobURL(dataURL: string): string | null {
	try {
		const base64Data = dataURL.split(",")[1];
		if (!base64Data) return null;

		const binaryString = atob(base64Data);
		const bytes = new Uint8Array(binaryString.length);
		for (let i = 0; i < binaryString.length; i++) {
			bytes[i] = binaryString.charCodeAt(i);
		}

		const blob = new Blob([bytes], { type: "application/octet-stream" });
		return URL.createObjectURL(blob);
	} catch {
		return null;
	}
}

interface ModelProps {
	url: string;
	position: [number, number, number];
	rotation: [number, number, number];
	scale: [number, number, number];
	id: string;
	isSelected: boolean;
	onSelect: () => void;
}

function Model({
	url,
	position,
	rotation,
	scale,
	id,
	isSelected,
	onSelect,
}: ModelProps) {
	const meshRef = useRef<THREE.Mesh>(null);
	const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [modelScale, setModelScale] = useState<number>(1);
	const [hasVertexColors, setHasVertexColors] = useState(false);
	const blobUrlRef = useRef<string | null>(null);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (geometry) {
				geometry.dispose();
			}
			if (blobUrlRef.current) {
				URL.revokeObjectURL(blobUrlRef.current);
			}
		};
	}, []);

	useEffect(() => {
		let cancelled = false;

		const loadModel = async () => {
			// Cleanup previous blob URL
			if (blobUrlRef.current) {
				URL.revokeObjectURL(blobUrlRef.current);
				blobUrlRef.current = null;
			}

			try {
				const isDataUrl = url.startsWith("data:");
				let format = "unknown";
				let loadUrl = url;

				if (isDataUrl) {
					format = "ply";
					// Convert to blob URL for better memory management
					const blobUrl = dataURLtoBlobURL(url);
					if (blobUrl) {
						blobUrlRef.current = blobUrl;
						loadUrl = blobUrl;
					}
				} else {
					const extension = url.split(".").pop()?.toLowerCase();
					format = extension || "unknown";
				}

				const loader = format === "obj" ? new OBJLoader() : new PLYLoader();

				if (format === "obj") {
					(loader as OBJLoader).load(
						loadUrl,
						(obj) => {
							if (cancelled) return;
							obj.traverse((child) => {
								if (child instanceof THREE.Mesh) {
									const geo = child.geometry.clone();
									geo.computeBoundingBox();
									geo.center();

									const bbox = geo.boundingBox!;
									const size = new THREE.Vector3();
									bbox.getSize(size);
									const maxDim = Math.max(size.x, size.y, size.z);
									setModelScale(maxDim > 0 ? 2 / maxDim : 1);

									setGeometry(geo);
								}
							});
						},
						undefined,
						() => {
							if (!cancelled) setError("Failed to load OBJ");
						}
					);
				} else if (format === "ply") {
					(loader as PLYLoader).load(
						loadUrl,
						(geo) => {
							if (cancelled) {
								geo.dispose();
								return;
							}

							const posAttr = geo.getAttribute("position");
							if (!posAttr || posAttr.count === 0) {
								setError("PLY has no geometry");
								geo.dispose();
								return;
							}

							geo.computeVertexNormals();
							geo.computeBoundingBox();

							const bbox = geo.boundingBox!;
							const size = new THREE.Vector3();
							bbox.getSize(size);
							const maxDim = Math.max(size.x, size.y, size.z);

							setModelScale(maxDim > 0 ? 2 / maxDim : 1);
							setHasVertexColors(geo.hasAttribute("color"));

							geo.center();
							setGeometry(geo);
						},
						undefined,
						() => {
							if (!cancelled) setError("Failed to load PLY");
						}
					);
				} else {
					setError("Unsupported format");
				}
			} catch (e) {
				console.error("Model load error:", e);
				if (!cancelled) setError("Failed to load model");
			}
		};

		loadModel();

		return () => {
			cancelled = true;
		};
	}, [url]);

	// Compute final scale
	const finalScale = useMemo<[number, number, number]>(
		() => [scale[0] * modelScale, scale[1] * modelScale, scale[2] * modelScale],
		[scale, modelScale]
	);

	if (error) {
		return (
			<mesh position={position} onClick={onSelect}>
				<boxGeometry args={[0.5, 0.5, 0.5]} />
				<meshStandardMaterial color="#ff4444" />
			</mesh>
		);
	}

	if (!geometry) {
		return (
			<mesh position={position}>
				<boxGeometry args={[0.3, 0.3, 0.3]} />
				<meshStandardMaterial color="#4fc3f7" wireframe />
			</mesh>
		);
	}

	return (
		<mesh
			ref={meshRef}
			geometry={geometry}
			position={position}
			rotation={rotation}
			scale={finalScale}
			onClick={(e) => {
				e.stopPropagation();
				onSelect();
			}}
		>
			<meshStandardMaterial
				color={isSelected ? "#00ff88" : "#ffffff"}
				vertexColors={hasVertexColors}
				metalness={0.2}
				roughness={0.5}
				side={THREE.DoubleSide}
			/>
		</mesh>
	);
}

function GiftBox({
	position,
	scale = 1,
}: {
	position: [number, number, number];
	scale?: number;
}) {
	return (
		<group position={position}>
			<mesh>
				<boxGeometry args={[scale, scale * 0.8, scale]} />
				<meshStandardMaterial color="#e74c3c" metalness={0.2} roughness={0.8} />
			</mesh>
			<mesh position={[0, 0, 0]}>
				<boxGeometry args={[scale * 1.02, scale * 0.1, scale * 0.1]} />
				<meshStandardMaterial color="#f1c40f" metalness={0.5} roughness={0.3} />
			</mesh>
			<mesh position={[0, 0, 0]}>
				<boxGeometry args={[scale * 0.1, scale * 0.82, scale * 0.1]} />
				<meshStandardMaterial color="#f1c40f" metalness={0.5} roughness={0.3} />
			</mesh>
			<group position={[0, scale * 0.45, 0]}>
				<mesh rotation={[0, 0, Math.PI / 4]}>
					<torusGeometry args={[scale * 0.15, scale * 0.03, 8, 16]} />
					<meshStandardMaterial
						color="#f1c40f"
						metalness={0.5}
						roughness={0.3}
					/>
				</mesh>
				<mesh rotation={[0, 0, -Math.PI / 4]}>
					<torusGeometry args={[scale * 0.15, scale * 0.03, 8, 16]} />
					<meshStandardMaterial
						color="#f1c40f"
						metalness={0.5}
						roughness={0.3}
					/>
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

export default function Scene3D({
	showGiftPreview = false,
	viewOnly = false,
	objects: propObjects,
}: Scene3DProps) {
	const { sceneObjects, selectedObjectId, setSelectedObjectId } = useAppStore();
	const displayObjects = propObjects || sceneObjects;
	const [canvasKey, setCanvasKey] = useState(0);

	// Force canvas recreation if context is lost
	const handleContextLost = useCallback((e: Event) => {
		e.preventDefault();
		console.warn("WebGL context lost, recreating canvas...");
		setTimeout(() => setCanvasKey((k) => k + 1), 100);
	}, []);

	return (
		<div className="w-full h-full bg-gradient-to-b from-slate-900 to-slate-950 rounded-2xl overflow-hidden">
			<Canvas
				key={canvasKey}
				camera={{ position: [4, 3, 4], fov: 50, near: 0.1, far: 50 }}
				gl={{
					antialias: false, // Disable for performance
					powerPreference: "high-performance",
					preserveDrawingBuffer: false,
				}}
				onCreated={({ gl }) => {
					gl.domElement.addEventListener("webglcontextlost", handleContextLost);
				}}
			>
				<ambientLight intensity={0.8} />
				<directionalLight position={[5, 10, 5]} intensity={0.8} />

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
							/>
						))
					)}
				</Suspense>

				<Grid
					cellSize={0.5}
					cellThickness={0.5}
					sectionSize={2}
					sectionThickness={1}
					fadeDistance={15}
					cellColor="#334155"
					sectionColor="#475569"
				/>

				<OrbitControls
					enableDamping
					dampingFactor={0.05}
					minDistance={1}
					maxDistance={10}
				/>
			</Canvas>
		</div>
	);
}
