# Shap-E Text-to-3D API on Modal.com

This directory contains the Modal.com deployment for serving OpenAI's Shap-E text-to-3D model as a scalable API.

## Overview

The deployment creates a GPU-powered serverless API that:
- Generates 3D meshes from text prompts
- Auto-scales based on demand
- Caches model weights for fast cold starts
- Supports PLY and OBJ output formats

## Prerequisites

1. Install Modal CLI:
```bash
pip install modal
```

2. Authenticate with Modal:
```bash
modal token new
```

## Deployment

### Deploy to Modal (Production)

```bash
modal deploy modal_shap_e.py
```

After deployment, you'll get a URL like:
```
https://<your-username>--shap-e-text-to-3d-web-app.modal.run
```

### Local Development

Run the API locally with hot-reload:
```bash
modal serve modal_shap_e.py
```

### Test Generation

Test the model directly:
```bash
modal run modal_shap_e.py --prompt "a cute teddy bear"
```

## API Endpoints

### `GET /`
Health check endpoint.

### `GET /health`
Returns API health status.

### `POST /generate`
Generate a 3D model from a text prompt.

**Request:**
```json
{
  "prompt": "a cute cat",
  "batch_size": 1,
  "guidance_scale": 15.0,
  "karras_steps": 64,
  "output_format": "ply"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Generated 3D model for: a cute cat",
  "model_data": "<base64-encoded-mesh>",
  "format": "ply"
}
```

### `POST /generate/raw`
Generate and return the raw mesh file directly.

**Request:** Same as `/generate`

**Response:** Binary mesh file with appropriate Content-Type header.

## Configuration

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `prompt` | required | - | Text description of the 3D object |
| `batch_size` | 1 | 1-4 | Number of variations to generate |
| `guidance_scale` | 15.0 | 1-30 | How closely to follow the prompt |
| `karras_steps` | 64 | 16-128 | Diffusion steps (quality vs speed) |
| `output_format` | "ply" | ply/obj | Output mesh format |

## GPU Options

The deployment uses an A10G GPU by default. You can change this in `modal_shap_e.py`:

| GPU | Cost | Speed | VRAM |
|-----|------|-------|------|
| T4 | $ | Slower | 16GB |
| A10G | $$ | Fast | 24GB |
| A100 | $$$ | Fastest | 40/80GB |

## Cost Estimation

- Cold start: ~30-60 seconds (model loading)
- Generation time: ~20-40 seconds per model
- Container kept warm for 5 minutes between requests
- Typical cost: $0.001-0.01 per generation

## Integration with Frontend

Set the environment variable in your Next.js app:

```env
NEXT_PUBLIC_TEXT_TO_3D_API=https://<your-username>--shap-e-text-to-3d-web-app.modal.run/generate
```

## Files

- `modal_shap_e.py` - Main Modal deployment file
- `shap_e_example.py` - Original example script for local testing
- `requirements.txt` - Python dependencies

## Troubleshooting

### Model loading is slow
The first request after deployment will be slower as models are downloaded. Subsequent requests use cached weights from the Modal Volume.

### Out of memory errors
Try reducing `batch_size` or `karras_steps`, or upgrade to a larger GPU.

### CORS errors
The API has CORS enabled for all origins. If you still have issues, check your frontend URL.

