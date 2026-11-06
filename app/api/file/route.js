// Serves one of the signed-in user's uploaded attachments (a screenshot or PDF of a lead). Paths are "<user_id>/...".
import { readOwnFile } from '@/lib/db';
import { withUser } from '@/lib/http';
export const dynamic = 'force-dynamic';

export const GET = withUser(async req => {
  const data = await readOwnFile(req.nextUrl.searchParams.get('p') || '');
  if (!data) return new Response('not found', { status: 404 });
  return new Response(data, { headers: { 'Content-Type': data.type || 'application/octet-stream', 'Cache-Control': 'private, max-age=3600' } });
});
