// Guardrails for tailored CVs. The AI only proposes a PLAN (orders + optional rewrites);
// the CV (M = the user's master CV data) is rebuilt here, so nothing can be added, dropped or lengthened.
// Rules enforced in code:
//  - same sections, entries and bullets as the master (only reordered)
//  - EDUCATION always first; "Additional offers" line stays last in its section
//  - a reworded bullet must be no longer than the original, add no new numbers, keep bold markers balanced
//  - spikes come only from the master's spikes (3-5)
// The browser then re-measures every bullet against the real font and reverts any that wrap (see cvpdf.js).

const plain = s => String(s || '').replace(/\*\*/g, '');
const boldLen = s => String(s || '').split('**').reduce((a, t, i) => a + (i % 2 ? t.length : 0), 0);
// Rough rendered width: bold glyphs are a little wider than regular ones.
const est = s => plain(s).length + 0.07 * boldLen(s);
const nums = s => (plain(s).match(/\d[\d,.]*/g) || []).map(x => x.replace(/[,.]+$/, ''));
const isPerm = (a, n) => Array.isArray(a) && a.length === n && new Set(a).size === n && a.every(i => Number.isInteger(i) && i >= 0 && i < n);

export function cvOutline(M) {
  return M.sections.map((s, si) => `[${si}] ${s.title}\n` + s.entries.map((e, ei) =>
    e.line ? `  (${si}.${ei}) LINE: ${plain(e.line)}`
      : `  (${si}.${ei}) ${e.org || '(untitled)'}${e.role ? ' | ' + e.role : ''}\n` + (e.bullets || []).map((b, bi) => `     <${si}.${ei}.${bi}> [${plain(b).length} chars] ${plain(b)}`).join('\n')
  ).join('\n')).join('\n');
}

export function validRewrite(orig, next) {
  const t = String(next || '').trim();
  if (!t || t === orig) return false;
  if ((t.match(/\*\*/g) || []).length % 2) return false;
  if (/[—–]/.test(t)) return false;
  if (est(t) > est(orig)) return false;                       // never longer
  const have = new Set(nums(orig));
  if (nums(t).some(n => !have.has(n))) return false;          // no invented numbers
  return true;
}

/** Rebuilds the CV from the master following the plan, dropping anything that breaks a rule. */
export function buildTailored(plan = {}, M) {
  const cv = JSON.parse(JSON.stringify(M));
  const notes = [];
  let reworded = 0, rejected = 0;

  // bullets: order + rewrites (keys use ORIGINAL indices)
  cv.sections.forEach((sec, si) => sec.entries.forEach((e, ei) => {
    if (!e.bullets) return;
    const orig = M.sections[si].entries[ei].bullets;
    let order = plan.bulletOrder?.[`${si}.${ei}`];
    if (!isPerm(order, orig.length)) order = orig.map((_, i) => i);
    e.bullets = order.map(bi => {
      const rw = plan.rewrites?.[`${si}.${ei}.${bi}`];
      if (rw !== undefined) { if (validRewrite(orig[bi], rw)) { reworded++; return String(rw).trim(); } rejected++; }
      return orig[bi];
    });
  }));

  // entries within each section (the "Additional offers" line stays last)
  cv.sections.forEach((sec, si) => {
    const n = sec.entries.length;
    let order = plan.entryOrder?.[si];
    if (!isPerm(order, n)) return;
    const lineIdx = sec.entries.map((e, i) => (e.line ? i : -1)).filter(i => i >= 0);
    order = [...order.filter(i => !lineIdx.includes(i)), ...lineIdx];
    sec.entries = order.map(i => sec.entries[i]);
  });

  // sections (EDUCATION stays first)
  const sn = cv.sections.length;
  if (isPerm(plan.sectionOrder, sn)) {
    const rest = plan.sectionOrder.filter(i => i !== 0);
    cv.sections = [0, ...rest].map(i => cv.sections[i]);
  }

  // spikes: only the master's own, 3-5
  const allowed = new Set(M.spikes);
  const sp = [...new Set((plan.spikes || []).filter(x => allowed.has(x)))].slice(0, 5);
  if (sp.length >= 3) cv.spikes = sp;

  const changes = (plan.changes || []).map(String).slice(0, 8);
  if (reworded) changes.push(`${reworded} bullet${reworded === 1 ? '' : 's'} reworded, none longer than the original`);
  return { cv, changes, rejected };
}
