import { NextRequest, NextResponse } from 'next/server';
import { backendFetch, isBackendConfigured } from '@/lib/backend';

interface GenerateResponse {
  success?: boolean;
  model_data?: string;
  model_url?: string;
  format?: string;
  message?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, userId } = body;

    // Input validation
    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    if (prompt.length > 500) {
      return NextResponse.json(
        { error: 'Prompt too long (max 500 characters)' },
        { status: 400 }
      );
    }

    if (!isBackendConfigured()) {
      // Return a mock/demo model for development
      console.log('No BACKEND_API_URL configured, returning demo model');
      
      return NextResponse.json({
        modelUrl: '/demo-models/cube.obj',
        message: 'Demo mode - configure BACKEND_API_URL for real generation',
      });
    }

    // Call the Python backend API (TRELLIS.2)
    console.log(`Calling Backend API for generate`);
    const { data, error, status } = await backendFetch<GenerateResponse>(
      '/api/generate',
      {
        method: 'POST',
        timeout: 720000,  // 12 minutes for TRELLIS.2 generation
        body: {
          prompt: prompt.trim(),
          user_id: userId,
          seed: -1,
          texture_size: 256,  // Reduced for speed
          decimation_target: 150000,  // Keep high to prevent mesh holes
        },
      }
    );

    if (error || !data) {
      console.error('Backend API error:', error);
      return NextResponse.json(
        { error: error || 'Failed to generate model' },
        { status: status || 500 }
      );
    }

    // If the API returns base64 model data, return as data URL for preview
    if (data.model_data) {
      return NextResponse.json({
        modelUrl: `data:application/octet-stream;base64,${data.model_data}`,
        modelData: data.model_data,  // Also pass raw base64 for wrapping later
        format: data.format || 'glb',  // TRELLIS.2 returns GLB
      });
    }

    // If API returns a URL directly, use it
    if (data.model_url) {
      return NextResponse.json({
        modelUrl: data.model_url,
        format: data.format || 'glb',  // TRELLIS.2 returns GLB
      });
    }

    return NextResponse.json(
      { error: 'Invalid response from generation API' },
      { status: 500 }
    );
  } catch (error) {
    console.error('Generation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
