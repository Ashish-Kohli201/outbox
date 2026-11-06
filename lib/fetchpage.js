// Reads links: Google Forms are parsed exactly; other pages are fetched, with a reader fallback for JS-heavy sites.
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
const GF_TYPES = { 0: 'text', 1: 'paragraph', 2: 'choice', 3: 'dropdown', 4: 'checkbox', 5: 'scale', 7: 'grid', 9: 'date', 10: 'time', 13: 'file' };

export function extractUrls(text) {
  return [...new Set((String(text || '').match(/https?:\/\/[^\s<>"')]+/g) || []).map(u => u.replace(/[.,;]+$/, '')))];
}

export function htmlToText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

function parseGoogleForm(html) {
  const m = html.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*(\[[\s\S]*?\]);\s*<\/script>/);
  if (!m) return null;
  const d = JSON.parse(m[1]);
  const title = d[1]?.[8] || d[3] || 'Google Form';
  const desc = d[1]?.[0] || '';
  const questions = (d[1]?.[1] || [])
    .filter(q => GF_TYPES[q[3]] !== undefined)
    .map(q => {
      const field = q[4]?.[0] || [];
      return {
        q: String(q[1] || '').trim() + (q[2] ? ` (${String(q[2]).trim()})` : ''),
        type: GF_TYPES[q[3]],
        options: (field[1] || []).map(o => o[0]).filter(Boolean),
        required: !!field[2],
        limit: ''
      };
    })
    .filter(q => q.q);
  return { title, text: `${title}\n${desc}`, form: questions };
}

export async function fetchPage(url) {
  let html = '', finalUrl = url, status = 0;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-IN,en;q=0.9' }, redirect: 'follow', signal: AbortSignal.timeout(12000) });
    status = r.status; finalUrl = r.url || url; html = await r.text();
  } catch (e) { /* fall through to reader */ }

  if (/docs\.google\.com\/forms/.test(finalUrl) && html) {
    const gf = parseGoogleForm(html);
    if (gf) return { url, ...gf };
  }
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.trim() || '';
  let text = html ? htmlToText(html) : '';
  const blocked = status >= 400 || text.length < 400 || /sign in|log in to|authwall|join linkedin/i.test(text.slice(0, 600));
  if (blocked) {
    try {
      const r = await fetch('https://r.jina.ai/' + url, { headers: { Accept: 'text/plain' }, signal: AbortSignal.timeout(20000) });
      if (r.ok) { const t = await r.text(); if (t.length > text.length) text = t; }
    } catch (e) { /* keep what we have */ }
  }
  const loginWall = /linkedin\.com/.test(url) && text.length < 600;
  return { url, title, text: text.slice(0, 15000), loginWall };
}
