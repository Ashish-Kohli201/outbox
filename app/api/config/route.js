// Public, non-secret settings the browser needs at runtime (so nothing has to be baked in at build time).
import { gmailConfigured } from '@/lib/gmail';
import { pushConfigured } from '@/lib/push';
import { json, open } from '@/lib/http';
export const dynamic = 'force-dynamic';

export const GET = open(async () => json({
  supabaseUrl: process.env.SUPABASE_URL || '',
  anonKey: process.env.SUPABASE_ANON_KEY || '',
  googleLogin: process.env.GOOGLE_LOGIN === '1',
  gmail: gmailConfigured(),
  push: pushConfigured(),
  vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || '',
  sharedAi: !!process.env.GEMINI_API_KEY
}));
