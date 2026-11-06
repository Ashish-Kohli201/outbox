import { getProfile, saveProfile } from '@/lib/db';
import { aiConfig } from '@/lib/llm';
import { json, wrap } from '@/lib/http';
export const dynamic = 'force-dynamic';

const FIELDS = ['name', 'email', 'phone', 'headline', 'target', 'links', 'tone', 'personality', 'sample_email', 'timezone', 'onboarded', 'cv_text', 'cv_data'];

export const GET = wrap(async (req, ctx, user) => {
  const [profile, ai] = await Promise.all([getProfile(), aiConfig()]);
  return json({ profile, hasAi: !!(ai.gemini || ai.ollama) });
});

export const PATCH = wrap(async req => {
  const body = await req.json();
  const patch = {};
  for (const k of FIELDS) if (k in body) patch[k] = body[k];
  return json({ profile: await saveProfile(patch) });
});
