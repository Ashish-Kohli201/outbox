import { disconnectGmail } from '@/lib/gmail';
import { json, wrap } from '@/lib/http';
export const POST = wrap(async () => { await disconnectGmail(); return json({ ok: true }); });
