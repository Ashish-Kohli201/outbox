// Turns the plain draft (with **bold**, [text](url), links, emails, phone lines) into the HTML and plain-text
// parts of an email. Pure functions, covered by tests.
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** **bold** and links become real HTML, the way a hand-written email looks in Gmail. */
export function toHtml(body) {
  const lines = String(body || '').split('\n').map(line => {
    const lab = line.trim().match(/^(LinkedIn|Website|Portfolio|GitHub)\s*:\s*(https?:\/\/\S+)$/i);
    if (lab) return `<a href="${esc(lab[2])}">${esc(lab[1])}</a>`;
    const t = line.trim();
    if (/^\+?[\d\s()-]{10,18}$/.test(t)) return `<a href="tel:${esc(t.replace(/[^\d+]/g, ''))}">${esc(t)}</a>`; // a bare phone line
    return esc(line)
      .replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:|tel:)[^)\s]+)\)/g, '<a href="$2">$1</a>') // [text](url)
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/(^|[\s(])(https?:\/\/[^\s<)"]+)/g, '$1<a href="$2">$2</a>')
      .replace(/(^|[\s(])([\w.+-]+@[\w-]+\.[\w.-]*\w)/g, '$1<a href="mailto:$2">$2</a>');
  });
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222">${lines.join('<br>')}</div>`;
}
export const toPlain = body => String(body || '')
  .replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:|tel:)[^)\s]+)\)/g, (m, t, u) => (/^https?:/.test(u) ? `${t}: ${u}` : t))
  .replace(/\*\*/g, '');

