import { getSetting, setSetting, listCvs } from '@/lib/db';
import { prefs, DEFAULT_PREFS } from '@/lib/prefs';
import { gmailEmail } from '@/lib/gmail';
import { json, wrap } from '@/lib/http';
export const dynamic = 'force-dynamic';

export const GET = wrap(async (req, ctx, user) => {
  const [email, subs, p, cvs, voice, ai] = await Promise.all([gmailEmail(), getSetting('push_subs'), prefs(), listCvs(), getSetting('voice_profile'), getSetting('ai')]);
  return json({
    gmail: email, pushDevices: (subs || []).length, prefs: p, cvs, voiceAt: voice?.at || null,
    ai: { gemini: !!ai?.gemini, ollama: !!ai?.ollama, model: ai?.model || '' },
    account: { email: user?.email || '' }
  });
});

export const POST = wrap(async req => {
  const body = await req.json();
  const p = { ...(await prefs()) };
  for (const k of Object.keys(DEFAULT_PREFS)) if (k in body) p[k] = body[k];
  await setSetting('prefs', p);
  return json({ prefs: p });
});
