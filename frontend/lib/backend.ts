/**
 * Backend API Client
 * 
 * This module provides communication with the Python backend API.
 */

const BACKEND_URL = process.env.BACKEND_API_URL || '';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: Record<string, unknown>;
  timeout?: number;
}

/**
 * Make a request to the backend API
 */
export async function backendFetch<T = unknown>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<{ data: T | null; error: string | null; status: number }> {
  const { method = 'GET', body, timeout = 300000 } = options;

  if (!BACKEND_URL) {
    return { data: null, error: 'Backend not configured', status: 503 };
  }

  const url = `${BACKEND_URL}${endpoint}`;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Backend error (${response.status}):`, errorText);
      
      let errorMessage = 'Request failed';
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.detail || errorJson.error || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }
      
      return { data: null, error: errorMessage, status: response.status };
    }

    const data = await response.json();
    return { data: data as T, error: null, status: response.status };
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return { data: null, error: 'Request timed out', status: 504 };
      }
      console.error('Backend fetch error:', error.message);
      return { data: null, error: error.message, status: 500 };
    }
    
    return { data: null, error: 'Unknown error', status: 500 };
  }
}

/**
 * Check if the backend is configured
 */
export function isBackendConfigured(): boolean {
  return !!BACKEND_URL;
}

/**
 * Get backend URL (for logging/debugging)
 */
export function getBackendUrl(): string {
  return BACKEND_URL;
}
