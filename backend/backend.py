"""
Gift App Backend API

This FastAPI backend handles:
- User management
- 3D model generation via Modal
- Gift wrapping (saving to Supabase)
- Gift distribution from pool
- Gift claiming and viewing

Run with: uvicorn backend:app --reload --port 8000
"""

import os
import re
import uuid
import base64
import random
import logging
from datetime import datetime, timedelta
from typing import Optional
from collections import defaultdict

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from supabase import create_client, Client

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY", "")  # Use anon key (RLS policies allow backend operations)
MODAL_API_URL = os.getenv("MODAL_API_URL", "")  # Modal TRELLIS.2 endpoint
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
STORAGE_BUCKET = "gifts"

# Rate limiting configuration
RATE_LIMIT_REQUESTS = int(os.getenv("RATE_LIMIT_REQUESTS", "100"))  # requests per window
RATE_LIMIT_WINDOW = int(os.getenv("RATE_LIMIT_WINDOW", "60"))  # seconds

# Initialize Supabase client
supabase: Client | None = None
if SUPABASE_URL and SUPABASE_KEY:
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Simple in-memory rate limiter
rate_limit_store: dict[str, list[datetime]] = defaultdict(list)


# ============================================================================
# Security Utilities
# ============================================================================

def get_client_ip(request: Request) -> str:
    """Get client IP from request, handling proxies."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def check_rate_limit(client_id: str) -> bool:
    """Check if client has exceeded rate limit. Returns True if allowed."""
    now = datetime.utcnow()
    window_start = now - timedelta(seconds=RATE_LIMIT_WINDOW)
    
    # Clean old entries
    rate_limit_store[client_id] = [
        ts for ts in rate_limit_store[client_id] if ts > window_start
    ]
    
    # Check limit
    if len(rate_limit_store[client_id]) >= RATE_LIMIT_REQUESTS:
        return False
    
    # Add current request
    rate_limit_store[client_id].append(now)
    return True


def sanitize_string(value: str, max_length: int = 1000) -> str:
    """Sanitize string input to prevent injection attacks."""
    if not value:
        return ""
    # Remove null bytes and control characters
    cleaned = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', value)
    # Limit length
    return cleaned[:max_length].strip()


def validate_uuid(value: str) -> bool:
    """Validate UUID format."""
    try:
        uuid.UUID(value, version=4)
        return True
    except (ValueError, AttributeError):
        return False


def validate_email(value: str) -> bool:
    """Validate email format."""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(pattern, value)) and len(value) <= 255


# Rate limiting middleware
async def rate_limit_middleware(request: Request):
    """Check rate limit for request."""
    client_id = get_client_ip(request)
    if not check_rate_limit(client_id):
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Please try again later.",
        )


# FastAPI app
app = FastAPI(
    title="Gift App API",
    description="Backend API for the 3D Gift Making & Sharing App",
    version="1.0.0",
    docs_url="/docs" if os.getenv("ENVIRONMENT") != "production" else None,
    redoc_url="/redoc" if os.getenv("ENVIRONMENT") != "production" else None,
)

# CORS middleware - configured for security
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)


# ============================================================================
# Pydantic Models with Validation
# ============================================================================

class UserCreate(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    
    @field_validator('email')
    @classmethod
    def validate_email_format(cls, v: str) -> str:
        v = sanitize_string(v, 255)
        if not validate_email(v):
            raise ValueError('Invalid email format')
        return v.lower()


class UserResponse(BaseModel):
    id: str
    email: str
    created_at: str


class GenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=500)
    user_id: Optional[str] = None
    seed: int = Field(default=-1)
    texture_size: int = Field(default=256, ge=128, le=1024)  # Reduced for speed
    decimation_target: int = Field(default=150000, ge=10000, le=500000)  # Keep high to prevent mesh holes
    
    @field_validator('prompt')
    @classmethod
    def sanitize_prompt(cls, v: str) -> str:
        return sanitize_string(v, 500)
    
    @field_validator('user_id')
    @classmethod
    def validate_user_id(cls, v: Optional[str]) -> Optional[str]:
        if v and not validate_uuid(v):
            raise ValueError('Invalid user ID format')
        return v


class GenerateResponse(BaseModel):
    success: bool
    model_data: Optional[str] = None  # Base64 encoded GLB data
    model_url: Optional[str] = None
    format: str = "glb"
    message: Optional[str] = None


class GiftObject(BaseModel):
    url: str
    format: Optional[str] = "glb"  # Model format: glb, ply, obj
    position: tuple[float, float, float] = (0, 0.5, 0)
    rotation: tuple[float, float, float] = (0, 0, 0)
    scale: tuple[float, float, float] = (1, 1, 1)


class WrapGiftRequest(BaseModel):
    user_id: str
    name: str = Field(..., min_length=1, max_length=200)
    prompt: Optional[str] = Field(default=None, max_length=500)
    model_data: Optional[str] = None  # Base64 encoded GLB data
    model_url: Optional[str] = Field(default=None, max_length=2000)
    objects: list[dict] = Field(default=[], max_length=50)
    
    @field_validator('user_id')
    @classmethod
    def validate_user_id(cls, v: str) -> str:
        if not validate_uuid(v):
            raise ValueError('Invalid user ID format')
        return v
    
    @field_validator('name')
    @classmethod
    def sanitize_name(cls, v: str) -> str:
        return sanitize_string(v, 200)
    
    @field_validator('prompt')
    @classmethod
    def sanitize_prompt(cls, v: Optional[str]) -> Optional[str]:
        return sanitize_string(v, 500) if v else None
    
    @field_validator('model_data')
    @classmethod
    def validate_model_data(cls, v: Optional[str]) -> Optional[str]:
        if v:
            # Validate it's valid base64 (max ~50MB encoded)
            if len(v) > 70_000_000:
                raise ValueError('Model data too large')
            try:
                base64.b64decode(v)
            except Exception:
                raise ValueError('Invalid base64 model data')
        return v


class GiftResponse(BaseModel):
    id: str
    creator_id: str
    recipient_id: Optional[str] = None
    name: str
    prompt: Optional[str] = None
    model_url: Optional[str] = None
    objects: list[dict]
    wrapped: bool
    status: str
    created_at: str
    creator_email: Optional[str] = None


class ClaimGiftRequest(BaseModel):
    user_id: str
    gift_id: str
    
    @field_validator('user_id', 'gift_id')
    @classmethod
    def validate_uuids(cls, v: str) -> str:
        if not validate_uuid(v):
            raise ValueError('Invalid UUID format')
        return v


# ============================================================================
# Helper Functions
# ============================================================================

def check_supabase():
    """Check if Supabase is configured."""
    if not supabase:
        raise HTTPException(
            status_code=503,
            detail="Database not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY.",
        )


async def upload_to_storage(
    user_id: str, 
    gift_id: str, 
    data: bytes, 
    filename: str
) -> str:
    """Upload a file to Supabase Storage and return the public URL."""
    check_supabase()
    
    file_path = f"{user_id}/{gift_id}/{filename}"
    
    # Upload to storage
    result = supabase.storage.from_(STORAGE_BUCKET).upload(
        file_path,
        data,
        {"content-type": "application/octet-stream", "upsert": "true"},
    )
    
    # Get public URL
    url_data = supabase.storage.from_(STORAGE_BUCKET).get_public_url(file_path)
    return url_data


async def delete_from_storage(url: str) -> bool:
    """Delete a file from Supabase Storage by its public URL.
    
    Returns True if deleted successfully, False otherwise.
    """
    if not supabase or not url:
        return False
    
    try:
        # Extract file path from URL
        # URL format: https://xxx.supabase.co/storage/v1/object/public/gifts/temp/uuid/model.glb
        if "/storage/v1/object/public/" in url:
            # Get the path after the bucket name
            parts = url.split(f"/storage/v1/object/public/{STORAGE_BUCKET}/")
            if len(parts) == 2:
                file_path = parts[1]
                supabase.storage.from_(STORAGE_BUCKET).remove([file_path])
                logger.info(f"Deleted from storage: {file_path}")
                return True
    except Exception as e:
        logger.error(f"Failed to delete from storage: {e}")
    
    return False


# ============================================================================
# Cleanup Endpoints
# ============================================================================

class CleanupRequest(BaseModel):
    url: str  # The storage URL to delete


@app.post("/api/cleanup")
async def cleanup_model(request: CleanupRequest, req: Request):
    """Delete a temporary model from storage (e.g., when user regenerates).
    
    This prevents orphaned files from accumulating in storage.
    Only deletes files in the 'temp' folder for safety.
    """
    await rate_limit_middleware(req)
    
    # Safety check: only delete from temp folder
    if "/temp/" not in request.url:
        logger.warning(f"Cleanup rejected - not a temp file: {request.url[:50]}")
        return {"success": False, "message": "Can only delete temporary files"}
    
    success = await delete_from_storage(request.url)
    return {"success": success}


# ============================================================================
# User Endpoints
# ============================================================================

@app.post("/api/users", response_model=UserResponse)
async def create_or_get_user(user: UserCreate, request: Request):
    """Create a new user or return existing user by email."""
    await rate_limit_middleware(request)
    logger.info(f"User create/get request for: {user.email[:3]}***")
    check_supabase()
    
    # Check if user exists
    result = supabase.table("users").select("*").eq("email", user.email).execute()
    
    if result.data and len(result.data) > 0:
        return UserResponse(**result.data[0])
    
    # Create new user
    new_user = supabase.table("users").insert({"email": user.email}).execute()
    
    if not new_user.data:
        raise HTTPException(status_code=500, detail="Failed to create user")
    
    return UserResponse(**new_user.data[0])


@app.get("/api/users/{user_id}", response_model=UserResponse)
async def get_user(user_id: str):
    """Get user by ID."""
    if not validate_uuid(user_id):
        raise HTTPException(status_code=400, detail="Invalid user ID format")
    check_supabase()
    
    result = supabase.table("users").select("*").eq("id", user_id).execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")
    
    return UserResponse(**result.data[0])


# ============================================================================
# Generation Endpoints
# ============================================================================

@app.post("/api/generate", response_model=GenerateResponse)
async def generate_3d_model(request: GenerateRequest, req: Request):
    """Generate a 3D model from a text prompt using Modal TRELLIS.2.
    
    The model is immediately uploaded to Supabase storage and a URL is returned.
    This avoids passing large base64 data back and forth.
    """
    await rate_limit_middleware(req)
    logger.info(f"Generate request: '{request.prompt[:50]}...' from {get_client_ip(req)}")
    
    if not MODAL_API_URL:
        # Demo mode - return a placeholder
        return GenerateResponse(
            success=True,
            model_url="/demo-models/cube.obj",
            format="obj",
            message="Demo mode - configure MODAL_API_URL for real generation",
        )
    
    try:
        async with httpx.AsyncClient(timeout=600.0, follow_redirects=True) as client:  # Follow redirects for Modal
            logger.info(f"Calling Modal API: {MODAL_API_URL}")
            response = await client.post(
                MODAL_API_URL,  # web_endpoint URL already includes the function name
                json={
                    "prompt": request.prompt,
                    "seed": request.seed,
                    "texture_size": request.texture_size,
                    "decimation_target": request.decimation_target,
                },
            )
            
            logger.info(f"Modal API response: status={response.status_code}, headers={dict(response.headers)}")
            
            if response.status_code != 200:
                logger.error(f"Modal API error: {response.status_code} - {response.text[:500]}")
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Modal API error: {response.text}",
                )
            
            data = response.json()
            model_data = data.get("model_data")
            model_format = data.get("format", "glb")
            
            # Upload model to Supabase storage immediately
            # This avoids passing large base64 back to frontend and then back again
            if model_data and supabase:
                try:
                    model_bytes = base64.b64decode(model_data)
                    # Use a temporary ID for pre-gift storage
                    temp_id = str(uuid.uuid4())
                    model_url = await upload_to_storage(
                        "temp",  # Temporary user folder
                        temp_id,
                        model_bytes,
                        f"model.{model_format}",
                    )
                    logger.info(f"Model uploaded to storage: {model_url[:50]}...")
                    
                    return GenerateResponse(
                        success=True,
                        model_url=model_url,
                        format=model_format,
                        message="Model generated and uploaded to storage",
                    )
                except Exception as e:
                    logger.error(f"Failed to upload model to storage: {e}")
                    # Fall back to returning base64 if storage upload fails
                    return GenerateResponse(
                        success=data.get("success", True),
                        model_data=model_data,
                        format=model_format,
                        message=data.get("message"),
                    )
            
            return GenerateResponse(
                success=data.get("success", True),
                model_data=data.get("model_data"),
                format=data.get("format", "glb"),
                message=data.get("message"),
            )
            
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Generation timed out - TRELLIS.2 can take up to 10 minutes")
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Failed to reach Modal API: {str(e)}")


# ============================================================================
# Gift Endpoints
# ============================================================================

@app.post("/api/gifts/wrap", response_model=GiftResponse)
async def wrap_gift(request: WrapGiftRequest, req: Request):
    """
    Wrap a gift - create a gift record and add to the gift pool.
    
    The model is already stored in Supabase storage during generation.
    This endpoint just:
    1. Creates a gift record in the database with the model URL
    2. Gift is added to the pool with status='in_pool'
    """
    await rate_limit_middleware(req)
    logger.info(f"Wrap gift request: '{request.name}' from user {request.user_id[:8]}...")
    check_supabase()
    
    gift_id = str(uuid.uuid4())
    
    # Model URL should come from objects array (already stored during generation)
    # or from model_url field directly
    model_url = request.model_url
    if not model_url and request.objects:
        model_url = request.objects[0].get("url") if request.objects else None
    
    # Build objects array - include the main model and any additional objects
    objects = request.objects.copy() if request.objects else []
    
    if model_url and not any(obj.get("url") == model_url for obj in objects):
        objects.insert(0, {
            "url": model_url,
            "position": [0, 0.5, 0],
            "rotation": [0, 0, 0],
            "scale": [1, 1, 1],
        })
    
    # Create gift in database
    gift_data = {
        "id": gift_id,
        "creator_id": request.user_id,
        "name": request.name,
        "prompt": request.prompt,
        "model_url": model_url,
        "objects": objects,
        "wrapped": True,
        "status": "in_pool",
    }
    
    result = supabase.table("gifts").insert(gift_data).execute()
    
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create gift")
    
    gift = result.data[0]
    
    return GiftResponse(
        id=gift["id"],
        creator_id=gift["creator_id"],
        recipient_id=gift.get("recipient_id"),
        name=gift["name"],
        prompt=gift.get("prompt"),
        model_url=gift.get("model_url"),
        objects=gift.get("objects", []),
        wrapped=gift.get("wrapped", True),
        status=gift.get("status", "in_pool"),
        created_at=gift["created_at"],
    )


@app.get("/api/gifts/pool", response_model=Optional[GiftResponse])
async def get_gift_from_pool(user_id: str):
    """
    Get a random gift from the pool for a user.
    
    Returns a gift that:
    - Is in the pool (status='in_pool')
    - Was not created by this user
    - Has not been claimed yet
    """
    if not validate_uuid(user_id):
        raise HTTPException(status_code=400, detail="Invalid user ID format")
    check_supabase()
    
    # Get all available gifts in the pool not created by this user
    result = supabase.table("gifts") \
        .select("*, users!gifts_creator_id_fkey(email)") \
        .eq("status", "in_pool") \
        .neq("creator_id", user_id) \
        .is_("recipient_id", "null") \
        .execute()
    
    if not result.data or len(result.data) == 0:
        return None
    
    # Select a random gift
    gift = random.choice(result.data)
    
    creator_email = None
    if gift.get("users"):
        creator_email = gift["users"].get("email")
    
    return GiftResponse(
        id=gift["id"],
        creator_id=gift["creator_id"],
        recipient_id=gift.get("recipient_id"),
        name=gift["name"],
        prompt=gift.get("prompt"),
        model_url=gift.get("model_url"),
        objects=gift.get("objects", []),
        wrapped=gift.get("wrapped", True),
        status=gift.get("status", "in_pool"),
        created_at=gift["created_at"],
        creator_email=creator_email,
    )


@app.post("/api/gifts/claim", response_model=GiftResponse)
async def claim_gift(request: ClaimGiftRequest, req: Request):
    """
    Claim a gift from the pool.
    
    This assigns the gift to the user and changes status to 'claimed'.
    """
    await rate_limit_middleware(req)
    logger.info(f"Claim gift request: gift {request.gift_id[:8]}... by user {request.user_id[:8]}...")
    check_supabase()
    
    # First check if the gift is still available
    check_result = supabase.table("gifts") \
        .select("*") \
        .eq("id", request.gift_id) \
        .eq("status", "in_pool") \
        .is_("recipient_id", "null") \
        .execute()
    
    if not check_result.data:
        raise HTTPException(
            status_code=409,
            detail="Gift is no longer available",
        )
    
    gift = check_result.data[0]
    
    # Don't allow users to claim their own gifts
    if gift["creator_id"] == request.user_id:
        raise HTTPException(
            status_code=400,
            detail="Cannot claim your own gift",
        )
    
    # Claim the gift
    update_result = supabase.table("gifts") \
        .update({
            "recipient_id": request.user_id,
            "status": "claimed",
            "claimed_at": datetime.utcnow().isoformat(),
        }) \
        .eq("id", request.gift_id) \
        .execute()
    
    if not update_result.data:
        raise HTTPException(status_code=500, detail="Failed to claim gift")
    
    gift = update_result.data[0]
    
    # Also record the opening
    supabase.table("gift_openings").insert({
        "gift_id": request.gift_id,
        "opener_id": request.user_id,
    }).execute()
    
    return GiftResponse(
        id=gift["id"],
        creator_id=gift["creator_id"],
        recipient_id=gift.get("recipient_id"),
        name=gift["name"],
        prompt=gift.get("prompt"),
        model_url=gift.get("model_url"),
        objects=gift.get("objects", []),
        wrapped=False,  # Now unwrapped since claimed
        status=gift.get("status", "claimed"),
        created_at=gift["created_at"],
    )


@app.post("/api/gifts/{gift_id}/open", response_model=GiftResponse)
async def open_gift(gift_id: str, user_id: str):
    """
    Mark a gift as opened (unwrapped).
    
    Updates the gift status to 'opened' and unwrapped to false.
    """
    if not validate_uuid(gift_id) or not validate_uuid(user_id):
        raise HTTPException(status_code=400, detail="Invalid ID format")
    check_supabase()
    
    # Update gift status
    result = supabase.table("gifts") \
        .update({
            "wrapped": False,
            "status": "opened",
        }) \
        .eq("id", gift_id) \
        .eq("recipient_id", user_id) \
        .execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Gift not found or not yours to open")
    
    gift = result.data[0]
    
    return GiftResponse(
        id=gift["id"],
        creator_id=gift["creator_id"],
        recipient_id=gift.get("recipient_id"),
        name=gift["name"],
        prompt=gift.get("prompt"),
        model_url=gift.get("model_url"),
        objects=gift.get("objects", []),
        wrapped=gift.get("wrapped", False),
        status=gift.get("status", "opened"),
        created_at=gift["created_at"],
    )


@app.get("/api/gifts/created/{user_id}", response_model=list[GiftResponse])
async def get_created_gifts(user_id: str):
    """Get all gifts created by a user."""
    if not validate_uuid(user_id):
        raise HTTPException(status_code=400, detail="Invalid user ID format")
    check_supabase()
    
    result = supabase.table("gifts") \
        .select("*") \
        .eq("creator_id", user_id) \
        .order("created_at", desc=True) \
        .execute()
    
    return [
        GiftResponse(
            id=g["id"],
            creator_id=g["creator_id"],
            recipient_id=g.get("recipient_id"),
            name=g["name"],
            prompt=g.get("prompt"),
            model_url=g.get("model_url"),
            objects=g.get("objects", []),
            wrapped=g.get("wrapped", True),
            status=g.get("status", "in_pool"),
            created_at=g["created_at"],
        )
        for g in result.data
    ]


@app.get("/api/gifts/received/{user_id}", response_model=list[GiftResponse])
async def get_received_gifts(user_id: str):
    """Get all gifts received by a user."""
    if not validate_uuid(user_id):
        raise HTTPException(status_code=400, detail="Invalid user ID format")
    check_supabase()
    
    result = supabase.table("gifts") \
        .select("*, users!gifts_creator_id_fkey(email)") \
        .eq("recipient_id", user_id) \
        .order("claimed_at", desc=True) \
        .execute()
    
    return [
        GiftResponse(
            id=g["id"],
            creator_id=g["creator_id"],
            recipient_id=g.get("recipient_id"),
            name=g["name"],
            prompt=g.get("prompt"),
            model_url=g.get("model_url"),
            objects=g.get("objects", []),
            wrapped=g.get("wrapped", True),
            status=g.get("status", "claimed"),
            created_at=g["created_at"],
            creator_email=g.get("users", {}).get("email") if g.get("users") else None,
        )
        for g in result.data
    ]


@app.get("/api/gifts/{gift_id}", response_model=GiftResponse)
async def get_gift(gift_id: str):
    """Get a specific gift by ID."""
    if not validate_uuid(gift_id):
        raise HTTPException(status_code=400, detail="Invalid gift ID format")
    check_supabase()
    
    result = supabase.table("gifts") \
        .select("*, users!gifts_creator_id_fkey(email)") \
        .eq("id", gift_id) \
        .execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Gift not found")
    
    gift = result.data[0]
    creator_email = None
    if gift.get("users"):
        creator_email = gift["users"].get("email")
    
    return GiftResponse(
        id=gift["id"],
        creator_id=gift["creator_id"],
        recipient_id=gift.get("recipient_id"),
        name=gift["name"],
        prompt=gift.get("prompt"),
        model_url=gift.get("model_url"),
        objects=gift.get("objects", []),
        wrapped=gift.get("wrapped", True),
        status=gift.get("status", "in_pool"),
        created_at=gift["created_at"],
        creator_email=creator_email,
    )


# ============================================================================
# Health Check
# ============================================================================

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "supabase_configured": supabase is not None,
        "modal_configured": bool(MODAL_API_URL),
    }


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "Gift App API",
        "version": "1.0.0",
        "docs": "/docs",
    }


# ============================================================================
# Run with Uvicorn
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
