import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { auth } from './firebase';

// Supabase configuration
// Get these from: https://app.supabase.com → Your Project → Settings → API
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
// Service role key (for authenticated operations - keep this SECRET!)
// Only use this on the client side if RLS is properly configured
// Better: use this only on the backend/server
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ Supabase URL or Anon Key missing. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env');
}

// Create base Supabase client (unauthenticated)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

// Cache for authenticated clients to avoid multiple instances
const authenticatedClientCache = new Map<string, SupabaseClient>();

/**
 * Get Supabase client for authenticated operations
 * 
 * IMPORTANT: Since we're using Firebase Auth (not Supabase Auth), Supabase RLS
 * won't automatically verify Firebase tokens. We have two options:
 * 
 * Option 1 (Current): Use service role key (bypasses RLS - less secure)
 * - Works immediately
 * - Requires service role key in env
 * - RLS is handled in application code (checking user_id matches Firebase UID)
 * 
 * Option 2 (Recommended for production): Configure Supabase to verify Firebase tokens
 * - More secure
 * - Requires backend setup to verify Firebase tokens
 * - RLS policies can use auth.uid() properly
 * 
 * For now, we use Option 1 with application-level auth checks.
 */
export async function getAuthenticatedSupabaseClient(): Promise<SupabaseClient> {
  const user = auth.currentUser;
  
  if (!user) {
    // Return unauthenticated client
    return supabase;
  }

  // Check cache first to avoid creating multiple instances
  const cacheKey = user.uid;
  if (authenticatedClientCache.has(cacheKey)) {
    return authenticatedClientCache.get(cacheKey)!;
  }

  // Option 1: Use service role key (bypasses RLS, but we check user_id in app code)
  if (supabaseServiceKey) {
    const client = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    authenticatedClientCache.set(cacheKey, client);
    return client;
  }

  // Option 2: Try to use Firebase token (requires Supabase Firebase integration)
  // This won't work unless you've configured Supabase to verify Firebase tokens
  const token = await user.getIdToken();
  
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-user-id': user.uid, // Pass user ID as header for RLS if needed
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  
  authenticatedClientCache.set(cacheKey, client);
  return client;
}

// Clear cached clients when user signs out
auth.onAuthStateChanged((user) => {
  if (!user) {
    authenticatedClientCache.clear();
  }
});

