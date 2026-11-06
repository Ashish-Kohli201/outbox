// Android share sheet target: anything shared into the app lands here.
import { NextResponse } from 'next/server';
import { insertItem, uploadFile } from '@/lib/db';
import { kick } from '@/lib/kick';
import { withUser } from '@/lib/http';

export const POST = withUser(async req => {
  const fd = await req.formData();
  const text = ['title', 'text', 'url'].map(k => String(fd.get(k) || '').trim()).filter(Boolean).join('\n');
  const files = [];
  for (const f of fd.getAll('files')) if (f && typeof f === 'object' && f.size) files.push(await uploadFile(f));
  const item = await insertItem({ status: 'queued', raw_text: text, files });
  kick(item.id);
  return NextResponse.redirect(new URL(`/item/${item.id}`, req.url), 303);
});
