import { notify } from '@/lib/push';
import { json, wrap } from '@/lib/http';
export const POST = wrap(async () => { await notify('Outbox', 'Notifications are working.', '/'); return json({ ok: true }); });
