import { getItem, updateItem, children, deleteItem } from '@/lib/db';
import { json, wrap } from '@/lib/http';
export const dynamic = 'force-dynamic';

export const GET = wrap(async (_, { params }) => { const { id } = await params; return json({ item: await getItem(id), children: await children(id) }); });

// Inline edits from the item page.
export const PATCH = wrap(async (req, { params }) => {
  const { id } = await params;
  const body = await req.json();
  const allowed = ['email', 'form', 'follow', 'reply', 'info', 'cv'];
  const patch = {};
  for (const k of allowed) if (k in body) patch[k] = body[k];
  return json({ item: await updateItem(id, patch) });
});

export const DELETE = wrap(async (_, { params }) => { const { id } = await params; await deleteItem(id); return json({ ok: true }); });
