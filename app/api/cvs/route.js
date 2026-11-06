import { listCvs, addCv, renameCv, removeCv, cvFile } from '@/lib/db';
import { json, wrap } from '@/lib/http';
export const dynamic = 'force-dynamic';

// GET -> list; GET ?id=x -> the PDF itself (for preview)
export const GET = wrap(async req => {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return json({ cvs: await listCvs() });
  const buf = await cvFile(id);
  if (!buf) return json({ error: 'Not found' }, 404);
  return new Response(buf, { headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'private, max-age=600' } });
});
export const POST = wrap(async req => {
  const files = (await req.formData()).getAll('files').filter(f => f && f.size);
  if (!files.length) return json({ error: 'Pick a PDF' }, 400);
  for (const f of files.slice(0, 6)) await addCv(f);
  return json({ cvs: await listCvs() });
});
export const PATCH = wrap(async req => { const { id, label } = await req.json(); await renameCv(id, label); return json({ cvs: await listCvs() }); });
export const DELETE = wrap(async req => { await removeCv((await req.json()).id); return json({ cvs: await listCvs() }); });
