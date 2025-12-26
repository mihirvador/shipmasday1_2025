"""
Shap-E Text-to-3D Model API for Modal.com

This module creates a scalable GPU-powered API endpoint for generating
3D models from text prompts using OpenAI's Shap-E model.

Deploy with: modal deploy modal_shap_e.py
Run locally: modal serve modal_shap_e.py
"""

import modal
from pathlib import Path

# Define the Modal app
app = modal.App("shap-e-text-to-3d")

# Create a persistent volume to cache model weights
model_cache = modal.Volume.from_name("shap-e-model-cache", create_if_missing=True)
MODEL_CACHE_PATH = "/root/.cache/shap_e_models"

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
    gpu="A10G",  # Can also use "A10G" for faster but more expensive inference
    timeout=600,  # 10 minute timeout for generation
    volumes={MODEL_CACHE_PATH: model_cache},
    scaledown_window=300,  # Keep container warm for 5 minutes
)
class ShapEModel:
    """Shap-E model class that handles text-to-3D generation."""

    @modal.enter()
    def load_models(self):
        """Load models when container starts - this runs once per container."""
        import torch
        from shap_e.models.download import load_model, load_config
        from shap_e.diffusion.gaussian_diffusion import diffusion_from_config

        print("Loading Shap-E models...")
        
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print(f"Using device: {self.device}")

        # Load the transmitter (decoder) and text-conditioned model
        self.xm = load_model("transmitter", device=self.device)
        self.model = load_model("text300M", device=self.device)
        self.diffusion = diffusion_from_config(load_config("diffusion"))

        # Commit any downloaded models to the volume
        model_cache.commit()
        
        print("Models loaded successfully!")

    @modal.method()
    def generate_3d(
        self,
        prompt: str,
        batch_size: int = 1,
        guidance_scale: float = 15.0,
        karras_steps: int = 64,
        output_format: str = "ply",  # "ply" or "obj"
    ) -> list[bytes]:
        """
        Generate 3D meshes from a text prompt.
        
        Args:
            prompt: Text description of the 3D object to generate
            batch_size: Number of variations to generate (1-4 recommended)
            guidance_scale: How closely to follow the prompt (higher = more faithful)
            karras_steps: Number of diffusion steps (more = better quality, slower)
            output_format: Output format, either "ply" or "obj"
            
        Returns:
            List of mesh file bytes
        """
        import torch
        import io
        from shap_e.diffusion.sample import sample_latents
        # Use our inlined decode_latent_mesh to avoid ipywidgets dependency

        print(f"Generating 3D model for prompt: '{prompt}'")
        print(f"Settings: batch_size={batch_size}, guidance={guidance_scale}, steps={karras_steps}")

        # Sample latent representations
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
            mesh = decode_latent_mesh(self.xm, latent).tri_mesh()
            
            # Write to bytes buffer
            buffer = io.BytesIO()
            if output_format.lower() == "ply":
                mesh.write_ply(buffer)
            else:
                # For OBJ, we need to handle it differently as write_obj expects text mode
                obj_content = io.StringIO()
                mesh.write_obj(obj_content)
                buffer.write(obj_content.getvalue().encode('utf-8'))
            
            buffer.seek(0)
            meshes.append(buffer.read())

        print(f"Generated {len(meshes)} mesh(es) successfully!")
        return meshes


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

    # Enable CORS for frontend access
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
        model_data: str | None = None  # Base64 encoded mesh data
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
            # Get the model instance and generate
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

            # Return the first mesh as base64
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


# Local testing function
@app.local_entrypoint()
def main(prompt: str = "a cute cat"):
    """Test the model locally."""
    print(f"Testing with prompt: {prompt}")
    
    model = ShapEModel()
    meshes = model.generate_3d.remote(prompt=prompt, batch_size=1)
    
    # Save the first mesh locally
    output_file = f"test_output.ply"
    with open(output_file, "wb") as f:
        f.write(meshes[0])
    
    print(f"Saved mesh to {output_file}")

