'use client';
import { useEffect } from 'react';
import { supabase, pushSession } from '@/lib/supabase-client';

// Keeps the server cookie in step with the Supabase session (sign-in, hourly token refresh).
export default function AuthSync() {
  useEffect(() => {
    let sub;
    supabase().then(sb => {
      const { data } = sb.auth.onAuthStateChange((event, session) => {
        if (session && ['SIGNED_IN', 'TOKEN_REFRESHED', 'INITIAL_SESSION'].includes(event)) pushSession(session);
      });
      sub = data.subscription;
    }).catch(() => {});
    return () => sub?.unsubscribe();
  }, []);
  return null;
}
