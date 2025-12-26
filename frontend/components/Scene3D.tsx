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
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// Convert base64 data URL to Blob URL (more memory efficient)
function dataURLtoBlobURL(
	dataURL: string,
	mimeType: string = "application/octet-stream"
): string | null {
	try {
		const base64Data = dataURL.split(",")[1];
		if (!base64Data) return null;

		const binaryString = atob(base64Data);
		const bytes = new Uint8Array(binaryString.length);
		for (let i = 0; i < binaryString.length; i++) {
			bytes[i] = binaryString.charCodeAt(i);
		}

		const blob = new Blob([bytes], { type: mimeType });
		return URL.createObjectURL(blob);
	} catch (e) {
		console.error("dataURLtoBlobURL error:", e);
		return null;
	}
}

interface ModelProps {
	url: string;
	format?: string; // Explicit format from API (glb, ply, obj)
	position: [number, number, number];
	rotation: [number, number, number];
	scale: [number, number, number];
	id: string;
	isSelected: boolean;
	onSelect: () => void;
}

function Model({
	url,
	format: explicitFormat,
	position,
	rotation,
	scale,
	id,
	isSelected,
	onSelect,
}: ModelProps) {
	const meshRef = useRef<THREE.Mesh>(null);
	const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
	const [material, setMaterial] = useState<
		THREE.Material | THREE.Material[] | null
	>(null);
	const [error, setError] = useState<string | null>(null);
	const [modelScale, setModelScale] = useState<number>(1);
	const [hasVertexColors, setHasVertexColors] = useState(false);
	const [hasTexture, setHasTexture] = useState(false);
	const blobUrlRef = useRef<string | null>(null);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (geometry) {
				geometry.dispose();
			}
			if (material) {
				if (Array.isArray(material)) {
					material.forEach((m) => m.dispose());
				} else {
					material.dispose();
				}
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
				let format = explicitFormat || "unknown"; // Use explicit format if provided
				let loadUrl = url;

				if (isDataUrl) {
					// Use explicit format if provided, otherwise default to glb
					if (!explicitFormat) {
						// Only check MIME type, not the entire base64 data
						const mimeType = url.split(";")[0].split(":")[1] || "";
						if (mimeType.includes("ply")) {
							format = "ply";
						} else if (mimeType.includes("gltf") || mimeType.includes("glb")) {
							format = "glb";
						} else {
							// Default to GLB for TRELLIS
							format = "glb";
						}
					}
					// Convert to blob URL with correct MIME type for GLB
					const mimeType =
						format === "glb" ? "model/gltf-binary" : "application/octet-stream";
					const blobUrl = dataURLtoBlobURL(url, mimeType);
					if (blobUrl) {
						blobUrlRef.current = blobUrl;
						loadUrl = blobUrl;
					}
				} else if (!explicitFormat) {
					const extension = url.split(".").pop()?.toLowerCase();
					format = extension || "unknown";
				}

				console.log(
					"Loading model format:",
					format,
					"from explicitFormat:",
					explicitFormat
				);

				if (format === "glb" || format === "gltf") {
					// GLB/GLTF loading (TRELLIS output)
					const gltfLoader = new GLTFLoader();
					gltfLoader.load(
						loadUrl,
						(gltf) => {
							if (cancelled) return;

							// Find the first mesh in the GLTF scene
							const meshes: THREE.Mesh[] = [];
							gltf.scene.traverse((child) => {
								if (child instanceof THREE.Mesh) {
									meshes.push(child);
								}
							});

							if (meshes.length === 0) {
								setError("GLB has no geometry");
								return;
							}

							const firstMesh = meshes[0];
							const geo = firstMesh.geometry.clone();

							geo.computeBoundingBox();
							geo.center();

							const bbox = geo.boundingBox!;
							const size = new THREE.Vector3();
							bbox.getSize(size);
							const maxDim = Math.max(size.x, size.y, size.z);
							setModelScale(maxDim > 0 ? 2 / maxDim : 1);

							// Clone and preserve the original material with textures
							const originalMat = firstMesh.material;
							if (originalMat) {
								if (Array.isArray(originalMat)) {
									setMaterial(originalMat.map((m) => m.clone()));
								} else {
									setMaterial(originalMat.clone());
								}

								// Check if material has textures (map property)
								const checkTexture = (m: THREE.Material): boolean => {
									if ("map" in m && (m as THREE.MeshStandardMaterial).map)
										return true;
									if (
										"emissiveMap" in m &&
										(m as THREE.MeshStandardMaterial).emissiveMap
									)
										return true;
									if (
										"normalMap" in m &&
										(m as THREE.MeshStandardMaterial).normalMap
									)
										return true;
									return false;
								};

								const hasTex = Array.isArray(originalMat)
									? originalMat.some(checkTexture)
									: checkTexture(originalMat);
								setHasTexture(hasTex);
								const firstMat = Array.isArray(originalMat)
									? originalMat[0]
									: originalMat;
								console.log("GLB material detected:", {
									hasTexture: hasTex,
									materialType: firstMat?.constructor.name,
									map:
										firstMat && "map" in firstMat
											? !!(firstMat as THREE.MeshStandardMaterial).map
											: false,
								});
							}

							// Check if the material has vertex colors
							const mat = firstMesh.material;
							if (mat && !Array.isArray(mat) && "vertexColors" in mat) {
								setHasVertexColors(
									(mat as THREE.MeshStandardMaterial).vertexColors
								);
							} else {
								setHasVertexColors(false);
							}

							console.log("GLB loaded successfully");
							setGeometry(geo);
						},
						undefined,
						(error) => {
							console.error("GLB load error:", error);
							if (!cancelled) setError("Failed to load GLB");
						}
					);
				} else if (format === "obj") {
					const objLoader = new OBJLoader();
					objLoader.load(
						loadUrl,
						(obj) => {
							if (cancelled) return;
							obj.traverse((child) => {
								if (child instanceof THREE.Mesh) {
									const geo = child.geometry.clone();
									// Rotate from Z-up to Y-up coordinate system
									geo.rotateX(-Math.PI / 2);
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
					const plyLoader = new PLYLoader();
					plyLoader.load(
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

							// Rotate from Z-up (Shap-E) to Y-up (Three.js) coordinate system
							geo.rotateX(-Math.PI / 2);

							geo.computeVertexNormals();
							geo.computeBoundingBox();

							// Check and enhance vertex colors if present
							const colorAttr = geo.getAttribute("color");
							if (colorAttr) {
								console.log("PLY has vertex colors, count:", colorAttr.count);

								// Analyze color range
								let maxColor = 0;
								for (let i = 0; i < colorAttr.count * 3; i++) {
									maxColor = Math.max(maxColor, colorAttr.array[i]);
								}
								console.log("Max color value:", maxColor);

								// Enhance colors - normalize and brighten
								const enhancedColors = new Float32Array(colorAttr.array.length);
								const normalize = maxColor > 1 ? 255 : 1;

								for (let i = 0; i < colorAttr.count; i++) {
									const r = colorAttr.array[i * 3] / normalize;
									const g = colorAttr.array[i * 3 + 1] / normalize;
									const b = colorAttr.array[i * 3 + 2] / normalize;

									// Apply gamma correction + saturation boost to brighten colors
									const gamma = 0.5;
									// Boost saturation by increasing distance from gray
									const avg = (r + g + b) / 3;
									const satBoost = 1.4;
									let sr = avg + (r - avg) * satBoost;
									let sg = avg + (g - avg) * satBoost;
									let sb = avg + (b - avg) * satBoost;
									// Clamp, then apply gamma
									sr = Math.max(0, Math.min(1, sr));
									sg = Math.max(0, Math.min(1, sg));
									sb = Math.max(0, Math.min(1, sb));
									enhancedColors[i * 3] = Math.min(1, Math.pow(sr, gamma));
									enhancedColors[i * 3 + 1] = Math.min(1, Math.pow(sg, gamma));
									enhancedColors[i * 3 + 2] = Math.min(1, Math.pow(sb, gamma));
								}

								geo.setAttribute(
									"color",
									new THREE.BufferAttribute(enhancedColors, 3)
								);
								console.log("Enhanced vertex colors with gamma correction");
								setHasVertexColors(true);
							} else {
								console.log("PLY has no vertex colors");
								setHasVertexColors(false);
							}

							const bbox = geo.boundingBox!;
							const size = new THREE.Vector3();
							bbox.getSize(size);
							const maxDim = Math.max(size.x, size.y, size.z);

							setModelScale(maxDim > 0 ? 2 / maxDim : 1);

							geo.center();
							setGeometry(geo);
						},
						undefined,
						() => {
							if (!cancelled) setError("Failed to load PLY");
						}
					);
				} else {
					// Try GLB as fallback for unknown formats
					console.log("Unknown format, trying GLB loader as fallback");
					const gltfLoader = new GLTFLoader();
					gltfLoader.load(
						loadUrl,
						(gltf) => {
							if (cancelled) return;

							const meshes: THREE.Mesh[] = [];
							gltf.scene.traverse((child) => {
								if (child instanceof THREE.Mesh) {
									meshes.push(child);
								}
							});

							if (meshes.length === 0) {
								setError("No geometry found");
								return;
							}

							const geo = meshes[0].geometry.clone();
							geo.computeBoundingBox();
							geo.center();

							const bbox = geo.boundingBox!;
							const size = new THREE.Vector3();
							bbox.getSize(size);
							const maxDim = Math.max(size.x, size.y, size.z);
							setModelScale(maxDim > 0 ? 2 / maxDim : 1);
							setHasVertexColors(false);
							setGeometry(geo);
						},
						undefined,
						() => {
							if (!cancelled) setError("Unsupported format");
						}
					);
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
			// Use preserved material if it has textures
			material={
				hasTexture && material
					? Array.isArray(material)
						? material[0]
						: material
					: undefined
			}
		>
			{/* Only render fallback materials if no texture material */}
			{!hasTexture &&
				(hasVertexColors ? (
					// Use MeshBasicMaterial for vertex colors - doesn't need lighting
					<meshBasicMaterial
						vertexColors
						side={THREE.DoubleSide}
						opacity={isSelected ? 0.9 : 1}
						transparent={isSelected}
					/>
				) : (
					// Fall back to standard material for models without vertex colors
					<meshStandardMaterial
						color={isSelected ? "#00ff88" : "#cccccc"}
						metalness={0.2}
						roughness={0.5}
						side={THREE.DoubleSide}
					/>
				))}
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
		format?: string;
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
								format={obj.format}
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
