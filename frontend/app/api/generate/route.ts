import { NextRequest, NextResponse } from 'next/server';
import { supabase, isDemoMode } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
  try {
    const { prompt, userId } = await request.json();

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    const apiUrl = process.env.NEXT_PUBLIC_TEXT_TO_3D_API;

    if (!apiUrl) {
      // Return a mock/demo model for development
      console.log('No TEXT_TO_3D_API configured, returning demo model');
      
      return NextResponse.json({
        modelUrl: '/demo-models/cube.obj',
        message: 'Demo mode - configure NEXT_PUBLIC_TEXT_TO_3D_API for real generation',
      });
    }

    // Call the Modal Shap-E API
    console.log(`Calling Text-to-3D API: ${apiUrl}`);
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        batch_size: 1,
        guidance_scale: 15.0,
        karras_steps: 64,
        output_format: 'ply',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Text-to-3D API error:', errorText);
      return NextResponse.json(
        { error: 'Failed to generate model' },
        { status: 500 }
      );
    }

    const data = await response.json();

    // If the API returns base64 model data, upload it to Supabase Storage
    if (data.model_data && !isDemoMode() && supabase) {
      try {
        // Decode base64 to binary
        const modelBuffer = Buffer.from(data.model_data, 'base64');
        const fileExtension = data.format || 'ply';
        const fileName = `${uuidv4()}.${fileExtension}`;
        const filePath = `models/${userId || 'anonymous'}/${fileName}`;

        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('gifts')
          .upload(filePath, modelBuffer, {
            contentType: fileExtension === 'ply' ? 'application/x-ply' : 'text/plain',
            upsert: true,
          });

        if (uploadError) {
          console.error('Storage upload error:', uploadError);
          // Fall back to returning base64 data URL
          return NextResponse.json({
            modelUrl: `data:application/octet-stream;base64,${data.model_data}`,
            format: data.format,
          });
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('gifts')
          .getPublicUrl(filePath);

        return NextResponse.json({
          modelUrl: urlData.publicUrl,
          format: data.format,
        });
      } catch (storageError) {
        console.error('Storage error:', storageError);
        // Fall back to data URL
        return NextResponse.json({
          modelUrl: `data:application/octet-stream;base64,${data.model_data}`,
          format: data.format,
        });
      }
    }

    // If API returns a URL directly, use it
    if (data.model_url || data.modelUrl) {
      return NextResponse.json({
        modelUrl: data.model_url || data.modelUrl,
        format: data.format,
      });
    }

    // If we have base64 data but no Supabase, return as data URL
    if (data.model_data) {
      return NextResponse.json({
        modelUrl: `data:application/octet-stream;base64,${data.model_data}`,
        format: data.format,
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
