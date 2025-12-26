"""
Shap-E Text-to-3D Model API for Modal.com

This module creates a scalable GPU-powered API endpoint for generating
3D models from text prompts using OpenAI's Shap-E model.

Deploy with: modal deploy modal_shap_e.py
Run locally: modal serve modal_shap_e.py
"""

import modal
import os

# Define the Modal app
app = modal.App("shap-e-text-to-3d")

# Create a persistent volume to cache model weights
model_cache = modal.Volume.from_name("shap-e-model-cache", create_if_missing=True)

# The shap-e library uses ~/.cache/shap_e_models by default
# We mount our volume at /cache and set XDG_CACHE_HOME to point there
CACHE_DIR = "/cache"
SHAP_E_CACHE = f"{CACHE_DIR}/shap_e_models"

# Define the container image with all dependencies
shap_e_image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("git", "libgl1-mesa-glx", "libglib2.0-0")
    .pip_install(
        "torch",
        "torchvision", 
        "numpy",
        "Pillow",
        "tqdm",
        "filelock",
        "pyyaml",
        "blobfile",
        "clip @ git+https://github.com/openai/CLIP.git",
        "shap-e @ git+https://github.com/openai/shap-e.git",
        "fastapi[standard]",
    )
    # Set environment variables for caching and memory management
    .env({
        "XDG_CACHE_HOME": CACHE_DIR,
        "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True",
        "SHAP_E_CACHE_DIR": SHAP_E_CACHE,
    })
)


def decode_latent_mesh(xm, latent):
    """
    Decode a latent tensor into a mesh.
    This is inlined to avoid importing shap_e.util.notebooks which requires ipywidgets.
    """
    import torch
    import math
    from shap_e.models.transmitter.base import Transmitter
    from shap_e.models.nn.camera import DifferentiableCameraBatch, DifferentiableProjectiveCamera
    from shap_e.util.collections import AttrDict

    def create_pan_cameras(size: int, device):
        origins = []
        xs = []
        ys = []
        zs = []
        for theta in range(0, 360, 360 // 20):
            z = math.cos(math.radians(theta)) * math.cos(math.radians(20))
            x = math.sin(math.radians(theta)) * math.cos(math.radians(20))
            y = math.sin(math.radians(20))
            origins.append([x * 4, y * 4, z * 4])
            zs.append([-x, -y, -z])
            xs.append([z, 0, -x])
            ys.append([x * y, -z**2 - x**2, y * z])
        return DifferentiableCameraBatch(
            shape=(1, len(xs)),
            flat_camera=DifferentiableProjectiveCamera(
                origin=torch.tensor(origins, device=device, dtype=torch.float32),
                x=torch.tensor(xs, device=device, dtype=torch.float32),
                y=torch.tensor(ys, device=device, dtype=torch.float32),
                z=torch.tensor(zs, device=device, dtype=torch.float32),
                width=size,
                height=size,
                x_fov=0.7,
                y_fov=0.7,
            ),
        )

    decoded = xm.renderer.render_views(
        AttrDict(cameras=create_pan_cameras(2, latent.device)),
        params=(xm.encoder if isinstance(xm, Transmitter) else xm).bottleneck_to_params(
            latent[None]
        ),
        options=AttrDict(rendering_mode="stf", render_with_direction=False),
    )
    return decoded.raw_meshes[0]


@app.cls(
    image=shap_e_image,
    gpu="A10G",
    timeout=600,
    volumes={CACHE_DIR: model_cache},
    scaledown_window=300,
)
class ShapEModel:
    """Shap-E model class that handles text-to-3D generation."""

    @modal.enter()
    def load_models(self):
        """Load models when container starts - this runs once per container."""
        import torch
        import shap_e.models.download as download_module
        from shap_e.models.download import load_model, load_config
        from shap_e.diffusion.gaussian_diffusion import diffusion_from_config

        print("=" * 50)
        print("Initializing Shap-E Model Container")
        print("=" * 50)

        # Reload volume to get any cached models
        model_cache.reload()

        # Ensure cache directory exists
        os.makedirs(SHAP_E_CACHE, exist_ok=True)
        
        # Monkey-patch the shap-e cache directory to use our volume
        original_cache_dir = download_module.default_cache_dir
        download_module.default_cache_dir = lambda: SHAP_E_CACHE
        
        # Check what's already cached
        cached_files = os.listdir(SHAP_E_CACHE) if os.path.exists(SHAP_E_CACHE) else []
        print(f"Cached files in {SHAP_E_CACHE}: {cached_files}")

        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print(f"Using device: {self.device}")
        
        # Print GPU memory info
        if torch.cuda.is_available():
            print(f"GPU: {torch.cuda.get_device_name(0)}")
            print(f"Total GPU memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.2f} GB")

        print("Loading transmitter model...")
        self.xm = load_model("transmitter", device=self.device)
        
        print("Loading text300M model...")
        self.model = load_model("text300M", device=self.device)
        
        print("Loading diffusion config...")
        self.diffusion = diffusion_from_config(load_config("diffusion"))

        # Commit newly downloaded models to the volume for future use
        model_cache.commit()
        
        # Print memory usage after loading
        if torch.cuda.is_available():
            allocated = torch.cuda.memory_allocated(0) / 1e9
            reserved = torch.cuda.memory_reserved(0) / 1e9
            print(f"GPU memory after loading: {allocated:.2f} GB allocated, {reserved:.2f} GB reserved")

        print("=" * 50)
        print("Models loaded successfully!")
        print("=" * 50)

    @modal.method()
    def generate_3d(
        self,
        prompt: str,
        batch_size: int = 1,
        guidance_scale: float = 15.0,
        karras_steps: int = 64,
        output_format: str = "ply",
    ) -> list[bytes]:
        """
        Generate 3D meshes from a text prompt.
        """
        import torch
        import io
        import gc
        from shap_e.diffusion.sample import sample_latents

        print(f"\n{'=' * 50}")
        print(f"Generating 3D model for: '{prompt}'")
        print(f"Settings: batch_size={batch_size}, guidance={guidance_scale}, steps={karras_steps}")
        
        # Print memory before generation
        if torch.cuda.is_available():
            allocated = torch.cuda.memory_allocated(0) / 1e9
            print(f"GPU memory before generation: {allocated:.2f} GB allocated")

        try:
            # Sample latent representations with autocast for memory efficiency
            with torch.cuda.amp.autocast():
                latents = sample_latents(
                    batch_size=batch_size,
                    model=self.model,
                    diffusion=self.diffusion,
                    guidance_scale=guidance_scale,
                    model_kwargs=dict(texts=[prompt] * batch_size),
                    progress=True,
                    clip_denoised=True,
                    use_fp16=True,
                    use_karras=True,
                    karras_steps=karras_steps,
                    sigma_min=1e-3,
                    sigma_max=160,
                    s_churn=0,
                )

            # Decode latents to meshes
            meshes = []
            for i, latent in enumerate(latents):
                print(f"Decoding mesh {i + 1}/{len(latents)}...")
                
                with torch.no_grad():
                    mesh = decode_latent_mesh(self.xm, latent).tri_mesh()
                
                # Write to bytes buffer
                buffer = io.BytesIO()
                if output_format.lower() == "ply":
                    mesh.write_ply(buffer)
                else:
                    obj_content = io.StringIO()
                    mesh.write_obj(obj_content)
                    buffer.write(obj_content.getvalue().encode('utf-8'))
                
                buffer.seek(0)
                meshes.append(buffer.read())
                
                # Clear intermediate tensors
                del mesh
            
            # Clear latents
            del latents
            
            print(f"Generated {len(meshes)} mesh(es) successfully!")
            return meshes
            
        finally:
            # Always clean up GPU memory after generation
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                gc.collect()
                allocated = torch.cuda.memory_allocated(0) / 1e9
                print(f"GPU memory after cleanup: {allocated:.2f} GB allocated")
            print(f"{'=' * 50}\n")


# FastAPI web endpoint
@app.function(
    image=shap_e_image,
    timeout=600,
)
@modal.asgi_app()
def web_app():
    """FastAPI web application for the Shap-E API."""
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import Response
    from pydantic import BaseModel, Field
    import base64

    api = FastAPI(
        title="Shap-E Text-to-3D API",
        description="Generate 3D models from text prompts using OpenAI's Shap-E",
        version="1.0.0",
    )

    api.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    class GenerateRequest(BaseModel):
        prompt: str = Field(..., description="Text description of the 3D object")
        batch_size: int = Field(default=1, ge=1, le=4, description="Number of variations")
        guidance_scale: float = Field(default=15.0, ge=1.0, le=30.0, description="Guidance scale")
        karras_steps: int = Field(default=64, ge=16, le=128, description="Diffusion steps")
        output_format: str = Field(default="ply", pattern="^(ply|obj)$", description="Output format")

    class GenerateResponse(BaseModel):
        success: bool
        message: str
        model_url: str | None = None
        model_data: str | None = None
        format: str

    @api.get("/")
    async def root():
        return {"message": "Shap-E Text-to-3D API", "status": "ready"}

    @api.get("/health")
    async def health():
        return {"status": "healthy"}

    @api.post("/generate", response_model=GenerateResponse)
    async def generate(request: GenerateRequest):
        """Generate a 3D model from a text prompt."""
        try:
            model = ShapEModel()
            meshes = model.generate_3d.remote(
                prompt=request.prompt,
                batch_size=request.batch_size,
                guidance_scale=request.guidance_scale,
                karras_steps=request.karras_steps,
                output_format=request.output_format,
            )

            if not meshes:
                raise HTTPException(status_code=500, detail="No meshes generated")

            mesh_data = base64.b64encode(meshes[0]).decode("utf-8")
            
            return GenerateResponse(
                success=True,
                message=f"Generated 3D model for: {request.prompt}",
                model_data=mesh_data,
                format=request.output_format,
            )

        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @api.post("/generate/raw")
    async def generate_raw(request: GenerateRequest):
        """Generate and return raw mesh file."""
        try:
            model = ShapEModel()
            meshes = model.generate_3d.remote(
                prompt=request.prompt,
                batch_size=1,
                guidance_scale=request.guidance_scale,
                karras_steps=request.karras_steps,
                output_format=request.output_format,
            )

            if not meshes:
                raise HTTPException(status_code=500, detail="No meshes generated")

            content_type = "application/x-ply" if request.output_format == "ply" else "text/plain"
            filename = f"model.{request.output_format}"
            
            return Response(
                content=meshes[0],
                media_type=content_type,
                headers={"Content-Disposition": f"attachment; filename={filename}"},
            )

        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    return api


@app.local_entrypoint()
def main(prompt: str = "a cute cat"):
    """Test the model locally."""
    print(f"Testing with prompt: {prompt}")
    
    model = ShapEModel()
    meshes = model.generate_3d.remote(prompt=prompt, batch_size=1)
    
    output_file = "test_output.ply"
    with open(output_file, "wb") as f:
        f.write(meshes[0])
    
    print(f"Saved mesh to {output_file}")
