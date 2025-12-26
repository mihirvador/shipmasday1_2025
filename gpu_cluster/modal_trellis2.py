"""
TRELLIS.2 Text-to-3D Model API for Modal.com

Following the official TRELLIS.2 setup.sh with PR #20 fixes.

Deploy with: modal deploy modal_trellis2.py
Run locally: modal serve modal_trellis2.py
"""

import modal
import os
import sys
from pathlib import Path

# Define the Modal app
app = modal.App("trellis2-text-to-3d")

# Persistent volume for model caching
model_cache = modal.Volume.from_name("trellis2-model-cache", create_if_missing=True)
MODEL_CACHE_DIR = "/model-cache"
TRELLIS_DIR = "/trellis2"

# Path to local trellis2 folder
LOCAL_TRELLIS_DIR = Path(__file__).parent / "trellis2"

# Build image following setup.sh exactly with PR #20 fixes
trellis2_image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.4.0-devel-ubuntu22.04",
        add_python="3.10",
    )
    .apt_install(
        "git",
        "wget",
        "curl",
        "ffmpeg",
        "libgl1-mesa-glx",
        "libglib2.0-0",
        "libsm6",
        "libxext6",
        "libxrender-dev",
        "libgomp1",
        "build-essential",
        "ninja-build",
        # For pillow-simd (from setup.sh)
        "libjpeg-dev",
        "zlib1g-dev",
        "libpng-dev",
        # For compilation
        "clang",
        "gcc",
        "g++",
    )
    .env({
        "CUDA_HOME": "/usr/local/cuda",
        "PATH": "/usr/local/cuda/bin:$PATH",
        "LD_LIBRARY_PATH": "/usr/local/cuda/lib64:$LD_LIBRARY_PATH",
        # Library paths for CUDA compilation (from setup.sh)
        "LIBRARY_PATH": "/usr/lib/x86_64-linux-gnu:/usr/local/cuda/lib64/stubs",
        "LDFLAGS": "-L/usr/lib/x86_64-linux-gnu -L/usr/local/cuda/lib64/stubs",
    })
    # Copy local trellis2 folder to container
    .add_local_dir(str(LOCAL_TRELLIS_DIR), TRELLIS_DIR, copy=True)
    # Install PyTorch 2.6.0 with CUDA 12.4 (from setup.sh --new-env)
    .pip_install(
        "torch==2.6.0",
        "torchvision==0.21.0",
        extra_index_url="https://download.pytorch.org/whl/cu124",
    )
    # Install basic dependencies (from setup.sh --basic)
    .pip_install(
        "imageio",
        "imageio-ffmpeg",
        "tqdm",
        "easydict",
        "opencv-python-headless",
        "ninja",
        "trimesh",
        "transformers",
        "gradio==6.0.1",
        "tensorboard",
        "pandas",
        "lpips",
        "zstandard",
        "kornia",
        "timm",
        # For our API
        "fastapi[standard]",
        "diffusers>=0.30.0",
        "accelerate",
        "safetensors",
        "huggingface_hub",
        "rembg",
        "onnxruntime",
        # For builds
        "psutil",
        "packaging",
        "wheel",
        "setuptools",
    )
    # Install utils3d (from setup.sh --basic)
    .run_commands(
        "pip install git+https://github.com/EasternJournalist/utils3d.git@9a4eb15e4021b67b12c460c7057d642626897ec8",
    )
    # Install pillow-simd (from setup.sh --basic)
    .run_commands(
        "pip install pillow-simd || pip install pillow",  # Fallback to pillow if simd fails
    )
    # Install nvdiffrast v0.4.0 (from setup.sh --nvdiffrast with PR #20 fix)
    .run_commands(
        "mkdir -p /tmp/extensions",
        "git clone -b v0.4.0 https://github.com/NVlabs/nvdiffrast.git /tmp/extensions/nvdiffrast",
        "pip install /tmp/extensions/nvdiffrast --no-build-isolation",
        gpu="A100",
    )
    # Install nvdiffrec (from setup.sh --nvdiffrec with PR #20 fix)
    .run_commands(
        "rm -rf /tmp/extensions/nvdiffrec",
        "git clone -b renderutils https://github.com/JeffreyXiang/nvdiffrec.git /tmp/extensions/nvdiffrec",
        "pip install /tmp/extensions/nvdiffrec --no-build-isolation",
        gpu="A100",
    )
    # Install cumesh (from setup.sh --cumesh with PR #20 fix)
    .run_commands(
        "rm -rf /tmp/extensions/CuMesh",
        "git clone https://github.com/JeffreyXiang/CuMesh.git /tmp/extensions/CuMesh",
        "cd /tmp/extensions/CuMesh && git config --file=.gitmodules submodule.third_party/cubvh.url https://github.com/JeffreyXiang/cubvh.git",
        "cd /tmp/extensions/CuMesh && git submodule sync",
        "cd /tmp/extensions/CuMesh && git submodule update --init --recursive",
        "pip install /tmp/extensions/CuMesh --no-build-isolation",
        gpu="A100",
    )
    # Install flexgemm (from setup.sh --flexgemm)
    .run_commands(
        "git clone https://github.com/JeffreyXiang/FlexGEMM.git /tmp/extensions/FlexGEMM --recursive",
        "pip install /tmp/extensions/FlexGEMM --no-build-isolation",
        gpu="A100",
    )
    # Install o-voxel (from setup.sh --o-voxel with PR #20 fix)
    .run_commands(
        "rm -rf /tmp/extensions/o-voxel",
        f"cp -r {TRELLIS_DIR}/o-voxel /tmp/extensions/o-voxel",
        # Fix dependencies to avoid git reinstall (from PR #20)
        "cd /tmp/extensions/o-voxel && sed -i 's|cumesh @ git+https://github.com/JeffreyXiang/CuMesh.git|cumesh|' pyproject.toml",
        "cd /tmp/extensions/o-voxel && sed -i 's|flex_gemm @ git+https://github.com/JeffreyXiang/FlexGEMM.git|flex_gemm|' pyproject.toml",
        "pip install /tmp/extensions/o-voxel --no-build-isolation",
        gpu="A100",
    )
    # Install flash-attn 2.7.3 (from setup.sh --flash-attn with PR #20 fix)
    .run_commands(
        "pip install flash-attn==2.7.3 --no-build-isolation",
        gpu="A100",
    )
    .env({
        "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True",
        "HF_HOME": MODEL_CACHE_DIR,
        "U2NET_HOME": f"{MODEL_CACHE_DIR}/u2net",  # Cache rembg models
        "OPENCV_IO_ENABLE_OPENEXR": "1",
        "PYTHONPATH": TRELLIS_DIR,
    })
)


# Optimized class-based approach with warm containers
# Models are loaded once when container starts, then reused for all requests

@app.cls(
    image=trellis2_image,
    gpu="A100",
    timeout=1200,
    container_idle_timeout=600,  # Keep container warm for 10 min between requests
    volumes={MODEL_CACHE_DIR: model_cache},
    secrets=[modal.Secret.from_name("huggingface-secret")],
)
class Trellis2Generator:
    """Optimized generator with pre-loaded models and warm CUDA kernels."""
    
    @modal.enter()
    def load_models(self):
        """Load models once when container starts (warm start optimization)."""
        import torch
        from huggingface_hub import login
        from PIL import Image
        import numpy as np
        
        # Login to HuggingFace
        hf_token = os.environ.get("HF_TOKEN")
        if hf_token:
            login(token=hf_token)
        
        # Add TRELLIS.2 to path
        sys.path.insert(0, TRELLIS_DIR)
        
        self.device = torch.device("cuda")
        print("=" * 50)
        print("Loading models (one-time initialization)...")
        print(f"GPU: {torch.cuda.get_device_name(0)}")
        print(f"Total GPU memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.2f} GB")
        
        # Load SDXL-Turbo for FAST image generation (4 steps instead of 20+)
        print("Loading SDXL-Turbo (fast mode)...")
        from diffusers import AutoPipelineForText2Image
        
        self.text_to_image = AutoPipelineForText2Image.from_pretrained(
            "stabilityai/sdxl-turbo",
            torch_dtype=torch.float16,
            variant="fp16",
            cache_dir=MODEL_CACHE_DIR,
        ).to(self.device)
        
        # Load TRELLIS.2
        print("Loading TRELLIS.2 pipeline...")
        from trellis2.pipelines import Trellis2ImageTo3DPipeline
        
        self.trellis = Trellis2ImageTo3DPipeline.from_pretrained("microsoft/TRELLIS.2-4B")
        self.trellis.cuda()
        
        # Pre-load rembg model
        print("Pre-loading rembg model...")
        from rembg import new_session
        self.rembg_session = new_session("u2net")
        
        # Warmup SDXL-Turbo (compile CUDA kernels)
        print("Warming up SDXL-Turbo...")
        _ = self.text_to_image(
            prompt="test",
            num_inference_steps=1,
            guidance_scale=0.0,
            width=512,
            height=512,
        )
        
        # Warmup rembg
        print("Warming up rembg...")
        from rembg import remove
        dummy_img = Image.fromarray(np.zeros((64, 64, 3), dtype=np.uint8))
        _ = remove(dummy_img, session=self.rembg_session)
        
        # Commit any newly downloaded models
        model_cache.commit()
        
        # Clear warmup memory
        import gc
        gc.collect()
        torch.cuda.empty_cache()
        
        print("=" * 50)
        print("All models loaded, warmed up, and ready!")
        print(f"GPU memory after warmup: {torch.cuda.memory_allocated() / 1e9:.2f} GB")
        print("=" * 50)
    
    @modal.web_endpoint(method="POST")
    def generate(self, request: dict):
        """Generate 3D model - models are pre-loaded for fast response."""
        import torch
        import io
        import gc
        import base64
        from PIL import Image
        import numpy as np
        from rembg import remove
        import o_voxel
        import time
        
        start_time = time.time()
        
        # Parse request
        prompt = request.get("prompt", "")
        seed = request.get("seed", -1)
        texture_size = request.get("texture_size", 256)  # Reduced for speed
        decimation_target = request.get("decimation_target", 150000)  # Keep high to prevent mesh holes
        
        if not prompt:
            return {"success": False, "message": "Prompt is required", "model_data": None, "format": "glb"}
        
        print("=" * 50)
        print(f"Generating 3D model for: '{prompt}'")
        print(f"GPU memory: {torch.cuda.memory_allocated() / 1e9:.2f} GB")
        
        # Set seed
        if seed == -1:
            seed = torch.randint(0, 2**32, (1,)).item()
        generator = torch.Generator(device=self.device).manual_seed(seed)
        print(f"Using seed: {seed}")
        
        # Step 1: Generate image with SDXL-Turbo (4 steps)
        enhanced_prompt = f"{prompt}, centered, single object, white background, product photo, studio lighting"
        
        step1_start = time.time()
        print(f"Step 1: Generating image with SDXL-Turbo (4 steps, 512x512)...")
        result = self.text_to_image(
            prompt=enhanced_prompt,
            num_inference_steps=4,  # SDXL-Turbo only needs 4 steps
            guidance_scale=0.0,  # SDXL-Turbo doesn't use guidance
            generator=generator,
            width=512,
            height=512,
            num_images_per_prompt=1,  # Explicitly request only 1 image
        )
        print(f"SDXL generated {len(result.images)} image(s)")
        image = result.images[0]
        print(f"Generated image: {image.size} in {time.time() - step1_start:.1f}s")
        
        # Step 1.5: Remove background (using pre-loaded session)
        step15_start = time.time()
        print("Step 1.5: Removing background...")
        image = remove(image, session=self.rembg_session)
        alpha = np.array(image)[:, :, 3]
        object_pixels = np.sum(alpha > 128)
        print(f"Background removed in {time.time() - step15_start:.1f}s, coverage: {100*object_pixels/alpha.size:.1f}%")
        
        if object_pixels < 500:
            return {"success": False, "message": "Background removal failed", "model_data": None, "format": "glb"}
        
        # Cleanup SDXL result
        del result
        gc.collect()
        torch.cuda.empty_cache()
        
        # Step 2: Generate 3D with TRELLIS.2 (pre-loaded)
        step2_start = time.time()
        print("Step 2: Converting to 3D with TRELLIS.2 (6 steps each)...")
        # Explicitly request only 1 sample, reduce steps for speed (default is 12)
        outputs = self.trellis.run(
            image, 
            num_samples=1,
            sparse_structure_sampler_params={"steps": 6},  # Reduced from 12
            shape_slat_sampler_params={"steps": 6},  # Reduced from 12
            tex_slat_sampler_params={"steps": 6},  # Reduced from 12
        )
        print(f"TRELLIS generated {len(outputs)} mesh(es)")
        mesh = outputs[0]
        mesh.simplify(16777216)
        print(f"Mesh generated in {time.time() - step2_start:.1f}s")
        
        # Step 3: Export to GLB
        step3_start = time.time()
        print(f"Step 3: Exporting to GLB (texture={texture_size}, decimation={decimation_target})...")
        glb = o_voxel.postprocess.to_glb(
            vertices=mesh.vertices,
            faces=mesh.faces,
            attr_volume=mesh.attrs,
            coords=mesh.coords,
            attr_layout=mesh.layout,
            voxel_size=mesh.voxel_size,
            aabb=[[-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]],
            decimation_target=decimation_target,
            texture_size=texture_size,
            remesh=True,
            remesh_band=1,
            remesh_project=0,
            verbose=False
        )
        
        buffer = io.BytesIO()
        # Export GLB with embedded textures (PNG format, webp has compatibility issues)
        glb.export(buffer, file_type='glb')
        buffer.seek(0)
        glb_data = buffer.read()
        print(f"GLB exported in {time.time() - step3_start:.1f}s, size: {len(glb_data) / 1e6:.1f} MB")
        
        # Cleanup
        del mesh, image
        gc.collect()
        torch.cuda.empty_cache()
        
        total_time = time.time() - start_time
        print("=" * 50)
        print(f"TOTAL TIME: {total_time:.1f}s")
        print("=" * 50)
        
        model_data_base64 = base64.b64encode(glb_data).decode("utf-8")
        
        return {
            "success": True,
            "message": f"Generated 3D model for: {prompt} in {total_time:.0f}s",
            "model_data": model_data_base64,
            "format": "glb",
        }


# Health check endpoint (lightweight, no GPU)
@app.function(image=trellis2_image, timeout=60)
@modal.web_endpoint(method="GET")
def health():
    return {"status": "healthy", "message": "TRELLIS.2 Text-to-3D API"}


@app.local_entrypoint()
def main(prompt: str = "a cute teddy bear"):
    """Test the model locally."""
    print(f"Testing with prompt: {prompt}")
    generator = Trellis2Generator()
    result = generator.generate.remote({"prompt": prompt})
    
    if result.get("success") and result.get("model_data"):
        import base64
        glb_data = base64.b64decode(result["model_data"])
        output_file = "test_output.glb"
        with open(output_file, "wb") as f:
            f.write(glb_data)
        print(f"Saved 3D model to {output_file}")
    else:
        print(f"Generation failed: {result.get('message')}")
