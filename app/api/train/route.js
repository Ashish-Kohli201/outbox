import { notes, insertNotes, deleteNote, getSetting, setSetting, swipeCounts } from '@/lib/db';
import { recentSent, gmailEmail } from '@/lib/gmail';
import { rebuildVoice } from '@/lib/voice';
import { llm } from '@/lib/llm';
import { json, wrap } from '@/lib/http';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const samples = async () => (await notes()).filter(n => n.kind === 'sample').map(({ id, title, source, created_at, body }) => ({ id, title, source, created_at, preview: body.slice(0, 400), chars: body.length }));
const state = async () => ({ notes: await samples(), voice: await getSetting('voice_profile'), gmail: await getSetting('gmail_learn'), swipes: await swipeCounts(), gmailConnected: !!(await gmailEmail()) });

export const GET = wrap(async () => json(await state()));

// JSON: { action: 'gmail' | 'add' (items) | 'rebuild' | 'saveVoice' }   multipart: files to read with AI (PDF / images)
export const POST = wrap(async req => {
  if ((req.headers.get('content-type') || '').includes('multipart')) {
    const fd = await req.formData();
    const rows = [];
    for (const f of fd.getAll('files').slice(0, 4)) {
      if (!f || !f.size) continue;
      const b64 = Buffer.from(await f.arrayBuffer()).toString('base64');
      const text = await llm({ json: false, maxTokens: 6000, files: [{ mime: f.type || 'application/pdf', b64 }], prompt: 'Transcribe, word for word, everything the AUTHOR of this document wrote (emails, letters, answers, posts). Skip headers, signatures blocks and quoted replies from other people. Output only the text.' });
      if (text.trim().length > 80) rows.push({ kind: 'sample', title: (f.name || 'Document').slice(0, 120), body: text.trim().slice(0, 20000), source: 'upload' });
    }
    await insertNotes(rows);
    return json({ added: rows.length, ...(await state()) });
  }
  const a = await req.json();

  if (a.action === 'add') {
    const rows = (a.items || []).filter(n => n.body?.trim().length > 80).slice(0, 30).map(n => ({ kind: 'sample', title: String(n.title || 'Document').slice(0, 120), body: n.body.slice(0, 20000), source: 'upload' }));
    await insertNotes(rows);
    return json({ added: rows.length, ...(await state()) });
  }

  if (a.action === 'gmail') {
    // One small page of Sent mail per tap (stays under the 50-subrequest limit); each tap goes further back.
    const cur = (await getSetting('gmail_learn')) || { next: '', total: 0 };
    const { items, next, seen } = await recentSent(12, a.restart ? '' : cur.next);
    const have = new Set((await notes()).map(n => n.source));
    const rows = items.filter(m => !have.has('gmail:' + m.id)).map(m => ({ kind: 'sample', title: `To ${String(m.to).replace(/<.*>/, '').trim() || 'someone'}: ${m.subject || '(no subject)'}`.slice(0, 120), body: m.text, source: 'gmail:' + m.id }));
    await insertNotes(rows);
    await setSetting('gmail_learn', { next, total: (a.restart ? 0 : cur.total) + rows.length, at: Date.now() });
    const voice = rows.length || a.rebuild ? await rebuildVoice() : (await getSetting('voice_profile'));
    return json({ added: rows.length, seen, done: !next, ...(await state()), voice });
  }

  if (a.action === 'rebuild') return json({ voice: await rebuildVoice(), ...(await state()) });
  if (a.action === 'saveVoice') { const v = { text: a.text, at: Date.now(), edited: true }; await setSetting('voice_profile', v); return json({ voice: v }); }
  return json({ error: 'Unknown action' }, 400);
});

export const DELETE = wrap(async req => { await deleteNote((await req.json()).id); return json(await state()); });
