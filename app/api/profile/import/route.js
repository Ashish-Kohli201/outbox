import { saveProfile } from '@/lib/db';
import { importCv } from '@/lib/cvimport';
import { json, wrap } from '@/lib/http';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// JSON { text } (pasted or extracted from .docx in the browser) or multipart { file } (PDF / image, read by the AI).
export const POST = wrap(async req => {
  let input;
  if ((req.headers.get('content-type') || '').includes('multipart')) {
    const f = (await req.formData()).get('file');
    if (!f || !f.size) return json({ error: 'Pick a file' }, 400);
    if (f.size > 8 * 1024 * 1024) return json({ error: 'That file is over 8 MB' }, 400);
    input = { file: { mime: f.type || 'application/pdf', b64: Buffer.from(await f.arrayBuffer()).toString('base64') } };
  } else {
    const { text } = await req.json();
    if (!text || text.trim().length < 80) return json({ error: 'Paste your whole CV (at least a few lines)' }, 400);
    input = { text };
  }
  const r = await importCv(input);
  const profile = await saveProfile({ ...r });
  return json({ profile });
});
