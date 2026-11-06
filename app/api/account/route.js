// Your data is yours: download everything, or delete the account and every row and file.
import { NextResponse } from 'next/server';
import { exportAll, deleteAccount } from '@/lib/db';
import { COOKIE } from '@/lib/auth';
import { wrap } from '@/lib/http';
export const dynamic = 'force-dynamic';

export const GET = wrap(async () => new Response(JSON.stringify(await exportAll(), null, 2), {
  headers: { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="outbox-export.json"' }
}));

export const DELETE = wrap(async req => {
  const { confirm } = await req.json();
  if (confirm !== 'DELETE') return NextResponse.json({ error: 'Type DELETE to confirm' }, { status: 400 });
  await deleteAccount();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, '', { path: '/', maxAge: 0 });
  return res;
});
