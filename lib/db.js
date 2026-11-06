// Database access. Every helper is scoped to the current user (lib/ctx.js): reads filter by user_id and
// inserts stamp it, so one user can never see another's rows. `db()` is exported for the few
// cross-user jobs (cron) - use it carefully.
import { createClient } from '@supabase/supabase-js';
import { uid, memo, forget } from './ctx';

let client;
export function db() {
  if (!client) client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  return client;
}
const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
const mine = (table, cols = '*') => db().from(table).select(cols).eq('user_id', uid());

/* ---- items ---- */
export async function getItem(id) { return ok(await mine('items').eq('id', id).single()); }
export async function listItems() {
  return ok(await mine('items', 'id,created_at,parent_id,status,kind,info,email,follow,reply,sent_at,next_follow_at,follow_count,error,raw_text').order('created_at', { ascending: false }).limit(300));
}
export async function insertItem(row) { return ok(await db().from('items').insert({ ...row, user_id: uid() }).select().single()); }
export async function updateItem(id, patch) {
  return ok(await db().from('items').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', uid()).select().single());
}
export async function children(id) { return ok(await mine('items').eq('parent_id', id).order('created_at')); }
export async function deleteItem(id) { return ok(await db().from('items').delete().eq('id', id).eq('user_id', uid())); }
export async function countItems(statuses) {
  const { count } = await db().from('items').select('id', { count: 'exact', head: true }).eq('user_id', uid()).in('status', statuses);
  return count || 0;
}

/* ---- settings (key/value per user) ---- */
export async function getSetting(key) {
  const d = ok(await db().from('settings').select('value').eq('user_id', uid()).eq('key', key).maybeSingle());
  return d ? d.value : null;
}
export async function setSetting(key, value) { return ok(await db().from('settings').upsert({ user_id: uid(), key, value })); }

/* ---- style: what the AI drafted vs what the user actually sent ---- */
export async function recordStyle(type, aiDraft, final) {
  if (!final) return;
  await db().from('style').insert({ user_id: uid(), type, ai_draft: aiDraft || '', final });
}
export async function recentStyle() { return ok(await mine('style').order('created_at', { ascending: false }).limit(12)); }

/* ---- files: "<user_id>/<name>" in the private 'dumps' bucket ---- */
const own = path => String(path || '').startsWith(uid() + '/') && !String(path).includes('..');
export async function uploadFile(file) {
  const path = `${uid()}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${(file.name || 'file').replace(/[^\w.-]/g, '_')}`;
  ok(await db().storage.from('dumps').upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type || 'application/octet-stream' }));
  return { path, mime: file.type || 'application/octet-stream', name: file.name || 'file' };
}
export async function loadFiles(list) {
  const out = [];
  for (const f of (list || []).slice(0, 4)) {
    if (!own(f.path)) continue;
    const { data, error } = await db().storage.from('dumps').download(f.path);
    if (error) continue;
    out.push({ mime: f.mime, b64: Buffer.from(await data.arrayBuffer()).toString('base64') });
  }
  return out;
}
export async function readOwnFile(path) {
  if (!own(path)) return null;
  const { data, error } = await db().storage.from('dumps').download(path);
  return error ? null : data;
}
export async function storedPdf(rel) { // rel like "cv/abc.pdf" or "sched/<item>.pdf"
  const { data, error } = await db().storage.from('dumps').download(`${uid()}/${rel}`);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer()).toString('base64');
}
export async function savePdf(rel, b64) {
  ok(await db().storage.from('dumps').upload(`${uid()}/${rel}`, Buffer.from(b64, 'base64'), { contentType: 'application/pdf', upsert: true }));
}

/* ---- writing samples and swipe verdicts ---- */
export async function notes(limit = 300) { return ok(await mine('notes').neq('kind', 'swipe').order('created_at', { ascending: false }).limit(limit)); }
export async function insertNotes(rows) { if (rows.length) ok(await db().from('notes').insert(rows.map(r => ({ ...r, user_id: uid() })))); }
export async function deleteNote(id) { return ok(await db().from('notes').delete().eq('id', id).eq('user_id', uid())); }
/** Swipe verdicts, newest first. body is JSON: { v: 'like'|'dislike'|'super', subject, body, scenario, lever, comment }. */
export async function swipes(limit = 60) {
  const rows = ok(await mine('notes', 'id,created_at,body').eq('kind', 'swipe').order('created_at', { ascending: false }).limit(limit));
  return rows.map(r => { try { return { id: r.id, at: r.created_at, ...JSON.parse(r.body) }; } catch { return null; } }).filter(Boolean);
}
export async function addSwipe(x) {
  return ok(await db().from('notes').insert({ user_id: uid(), kind: 'swipe', title: x.v, body: JSON.stringify(x), source: 'swipe' }).select('id').single());
}
export async function swipeCounts() {
  const rows = ok(await mine('notes', 'title').eq('kind', 'swipe').limit(2000));
  const c = { total: rows.length, like: 0, dislike: 0, super: 0 };
  rows.forEach(r => { if (c[r.title] !== undefined) c[r.title]++; });
  return c;
}

/* ---- CV library: several PDFs, each with a label ---- */
export async function listCvs() { return (await getSetting('cvs')) || []; }
export async function addCv(file) {
  const list = await listCvs();
  const id = Math.random().toString(36).slice(2, 9);
  ok(await db().storage.from('dumps').upload(`${uid()}/cv/${id}.pdf`, Buffer.from(await file.arrayBuffer()), { contentType: 'application/pdf' }));
  const name = file.name || 'CV.pdf';
  const row = { id, name, label: name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').slice(0, 40), at: Date.now() };
  await setSetting('cvs', [...list, row]);
  return row;
}
export async function renameCv(id, label) { await setSetting('cvs', (await listCvs()).map(c => (c.id === id ? { ...c, label: String(label || '').slice(0, 40) } : c))); }
export async function removeCv(id) {
  await db().storage.from('dumps').remove([`${uid()}/cv/${id}.pdf`]);
  await setSetting('cvs', (await listCvs()).filter(c => c.id !== id));
}
export async function cvFile(id) {
  const { data, error } = await db().storage.from('dumps').download(`${uid()}/cv/${id}.pdf`);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

/* ---- profile (who the user is) ---- */
export const getProfile = () => memo('profile', async () => {
  const p = ok(await mine('profiles').maybeSingle());
  if (p) return p;
  return ok(await db().from('profiles').insert({ user_id: uid() }).select().single());
});
export async function saveProfile(patch) {
  const row = ok(await db().from('profiles').upsert({ user_id: uid(), ...patch, updated_at: new Date().toISOString() }).select().single());
  forget('profile');
  return row;
}

/* ---- account: export and delete everything ---- */
export async function exportAll() {
  const t = async name => ok(await mine(name));
  return { profile: await t('profiles'), items: await t('items'), notes: await t('notes'), style: await t('style'), settings: (await t('settings')).filter(s => !['google', 'ai'].includes(s.key)) };
}
export async function deleteAccount() {
  const id = uid();
  const { data: files } = await db().storage.from('dumps').list(id, { limit: 1000 });
  const paths = [];
  for (const f of files || []) {
    if (f.id) paths.push(`${id}/${f.name}`);
    else { const { data: sub } = await db().storage.from('dumps').list(`${id}/${f.name}`, { limit: 1000 }); (sub || []).forEach(s => paths.push(`${id}/${f.name}/${s.name}`)); }
  }
  if (paths.length) await db().storage.from('dumps').remove(paths);
  const r = await db().auth.admin.deleteUser(id); // cascades to every table
  if (r.error) throw new Error(r.error.message);
}
