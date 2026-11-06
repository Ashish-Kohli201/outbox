'use client';
// Renders CV data to an A4 PDF in the browser: one page whenever the content can be made to fit (it scales
// down to 80%), otherwise it continues onto a second page.
const A4 = [595.28, 841.89];
const M = { l: 32.5, r: 32.5, t: 26, b: 24 };
const GREY = [0.35, 0.35, 0.35];

let fontCache;
async function loadFonts() {
  if (fontCache) return fontCache;
  const get = f => fetch('/fonts/' + f).then(r => { if (!r.ok) throw new Error('Font missing: ' + f); return r.arrayBuffer(); });
  const [reg, bold, ital, name] = await Promise.all(['Carlito-Regular.ttf', 'Carlito-Bold.ttf', 'Carlito-Italic.ttf', 'Caladea-Bold.ttf'].map(get));
  fontCache = { reg, bold, ital, name };
  return fontCache;
}

const segs = s => String(s || '').split('**').map((t, i) => ({ t, b: i % 2 === 1 })).filter(x => x.t);

// Last line of defence: measure every bullet with the real font. Any bullet that would wrap onto a second
// line goes back to its closest original from the master CV, so every bullet stays on one line.
const words = t => new Set(String(t).toLowerCase().replace(/\*\*/g, '').match(/[a-z0-9₹$%.]+/g) || []);
function closest(text, pool) {
  const a = words(text);
  let best = pool[0], score = -1;
  for (const p of pool) { const b = words(p); let i = 0; a.forEach(w => b.has(w) && i++); const j = i / (a.size + b.size - i || 1); if (j > score) { score = j; best = p; } }
  return best;
}
async function guardBullets(cv, bytes, PDFDocument, fontkit, masterData) {
  const doc = await PDFDocument.create(); doc.registerFontkit(fontkit);
  const reg = await doc.embedFont(bytes.reg, { subset: false }), bold = await doc.embedFont(bytes.bold, { subset: false });
  const limit = A4[0] - M.l - M.r - 15;
  const fits = b => segs(b).reduce((a, r) => a + (r.b ? bold : reg).widthOfTextAtSize(r.t, 9.5), 0) <= limit;
  const master = (masterData?.sections || []).flatMap(s => s.entries.flatMap(e => e.bullets || []));
  if (!master.length) return { cv, reverted: 0 };
  let reverted = 0;
  const out = JSON.parse(JSON.stringify(cv));
  out.sections.forEach(sec => sec.entries.forEach(e => {
    if (!e.bullets) return;
    e.bullets = e.bullets.map(b => { if (master.includes(b) || fits(b)) return b; reverted++; return closest(b, master); });
  }));
  return { cv: out, reverted };
}

export async function renderCvPdf(cvIn, masterData) {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const fontkit = (await import('@pdf-lib/fontkit')).default;
  const bytes = await loadFonts();
  const { cv } = await guardBullets(cvIn, bytes, PDFDocument, fontkit, masterData);

  for (let i = 0; i <= 8; i++) {
    const scale = 1 - i * 0.025, allowMulti = i === 8; // last resort: let it run onto a second page
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const F = {
      reg: await doc.embedFont(bytes.reg, { subset: false }),
      bold: await doc.embedFont(bytes.bold, { subset: false }),
      ital: await doc.embedFont(bytes.ital, { subset: false }),
      name: await doc.embedFont(bytes.name, { subset: false })
    };
    doc.setTitle(`${cv.name} - CV`); doc.setAuthor(cv.name);
    let page = doc.addPage(A4);
    const W = A4[0] - M.l - M.r;
    let y = A4[1] - M.t;
    const newPage = () => { page = doc.addPage(A4); y = A4[1] - M.t; };
    const s = n => n * scale;
    const col = c => rgb(...(c || [0, 0, 0]));
    const width = (text, font, size) => font.widthOfTextAtSize(text, size);

    // Draw mixed bold/regular runs, wrapping at maxW. Returns lines used.
    const rich = (runs, x, size, maxW, lh, { fontReg = F.reg, fontBold = F.bold, color } = {}) => {
      const words = [];
      runs.forEach(r => r.t.split(/(\s+)/).forEach(w => w && words.push({ w, b: r.b })));
      let line = [], lw = 0, lines = 0;
      const flush = () => {
        if (allowMulti && y < M.b + lh) newPage();
        let cx = x;
        while (line.length && /^\s+$/.test(line[line.length - 1].w)) line.pop();
        for (const p of line) { const f = p.b ? fontBold : fontReg; page.drawText(p.w, { x: cx, y, size, font: f, color: col(color) }); cx += width(p.w, f, size); }
        y -= lh; lines++; line = []; lw = 0;
      };
      for (const p of words) {
        const f = p.b ? fontBold : fontReg, ww = width(p.w, f, size);
        if (lw + ww > maxW && line.length && !/^\s+$/.test(p.w)) flush();
        if (!line.length && /^\s+$/.test(p.w)) continue;
        line.push(p); lw += ww;
      }
      if (line.length) flush();
      return lines;
    };
    const centered = (runs, size, lh, opts = {}) => {
      const tw = runs.reduce((a, r) => a + width(r.t, r.b ? (opts.fontBold || F.bold) : (opts.fontReg || F.reg), size), 0);
      rich(runs, M.l + (W - tw) / 2, size, W + 50, lh, opts);
    };

    // Header
    y -= s(18);
    centered([{ t: cv.name, b: true }], s(22), s(16), { fontBold: F.name });
    const spikeRuns = [];
    (cv.spikes || []).forEach((sp, i) => { if (i) spikeRuns.push({ t: '  |  ', b: false }); spikeRuns.push({ t: sp, b: true }); });
    centered(spikeRuns, s(10), s(13));
    centered([{ t: (cv.contact || []).map(c => c.text === 'LinkedIn' && c.href ? c.href.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') : c.text).join('  |  '), b: false }], s(9.5), s(12), { color: GREY });

    for (const sec of cv.sections || []) {
      if (allowMulti && y < M.b + s(60)) newPage();
      y -= s(6);
      page.drawText(sec.title.toUpperCase(), { x: M.l, y, size: s(12), font: F.bold });
      y -= s(3.5);
      page.drawLine({ start: { x: M.l, y }, end: { x: M.l + W, y }, thickness: 0.8, color: rgb(0, 0, 0) });
      y -= s(12);
      for (const e of sec.entries || []) {
        if (e.line) { y -= s(1); rich(segs(e.line), M.l, s(9.5), W, s(12)); continue; }
        if (allowMulti && y < M.b + s(50)) newPage();
        if (e.org) {
          page.drawText(e.org, { x: M.l, y, size: s(10.5), font: F.bold });
          let x = M.l + width(e.org, F.bold, s(10.5));
          if (e.role) page.drawText('  |  ' + e.role, { x, y, size: s(10), font: F.reg });
          if (e.date) page.drawText(e.date, { x: M.l + W - width(e.date, F.bold, s(9.5)), y, size: s(9.5), font: F.bold });
          y -= s(11.5);
        }
        if (e.sub) rich(segs(e.sub), M.l, s(9), W, s(11), { fontReg: F.ital, fontBold: F.bold, color: GREY });
        for (const b of e.bullets || []) {
          if (allowMulti && y < M.b + s(14)) newPage();
          page.drawText('•', { x: M.l + s(5), y, size: s(9.5), font: F.reg });
          rich(segs(b), M.l + s(15), s(9.5), W - s(15), s(11.6));
        }
        y -= s(3);
      }
    }
    if (allowMulti || (y >= M.b && doc.getPageCount() === 1)) return await doc.save();
  }
  throw new Error('Could not lay out the CV.');
}

export async function cvBlobUrl(cv, master) {
  const b = await renderCvPdf(cv, master);
  return URL.createObjectURL(new Blob([b], { type: 'application/pdf' }));
}
export async function cvBase64(cv, master) {
  const b = await renderCvPdf(cv, master);
  let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}
