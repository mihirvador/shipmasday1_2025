import { NextRequest, NextResponse } from 'next/server';
import { backendFetch, isBackendConfigured } from '@/lib/backend';

interface UserResponse {
  id: string;
  email: string;
  created_at: string;
}

// Email validation regex
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    // Input validation
    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'email is required' },
        { status: 400 }
      );
    }

    const trimmedEmail = email.trim().toLowerCase();

    if (!EMAIL_REGEX.test(trimmedEmail)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    if (trimmedEmail.length > 255) {
      return NextResponse.json(
        { error: 'Email too long' },
        { status: 400 }
      );
    }

    if (!isBackendConfigured()) {
      // Demo mode
      return NextResponse.json({
        user: {
          id: 'demo-user-id',
          email: trimmedEmail,
          created_at: new Date().toISOString(),
        },
      });
    }

    const { data, error, status } = await backendFetch<UserResponse>(
      '/api/users',
      {
        method: 'POST',
        body: { email: trimmedEmail },
      }
    );

    if (error || !data) {
      console.error('Backend create user error:', error);
      return NextResponse.json(
        { error: error || 'Failed to create user' },
        { status: status || 500 }
      );
    }

    return NextResponse.json({ user: data });
  } catch (error) {
    console.error('Create user error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
