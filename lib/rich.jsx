// Renders **bold**, [text](url), bare links, emails and phone lines the way the sent email will show them.
const LINK = /\[([^\]]+)\]\(((?:https?:\/\/|mailto:|tel:)[^)\s]+)\)|\*\*(.+?)\*\*|(https?:\/\/[^\s<)]+)|([\w.+-]+@[\w-]+\.[\w.-]*\w)/g;

function inline(line, key) {
  const out = []; let last = 0, m, i = 0;
  LINK.lastIndex = 0;
  while ((m = LINK.exec(line))) {
    if (m.index > last) out.push(line.slice(last, m.index));
    if (m[1]) out.push(<a key={key + '-' + i++} href={m[2]} target="_blank" rel="noopener">{m[1]}</a>);
    else if (m[3]) out.push(<b key={key + '-' + i++}>{m[3]}</b>);
    else if (m[4]) out.push(<a key={key + '-' + i++} href={m[4]} target="_blank" rel="noopener">{m[4]}</a>);
    else out.push(<a key={key + '-' + i++} href={'mailto:' + m[5]}>{m[5]}</a>);
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

export function Rich({ text }) {
  return String(text || '').split('\n').map((line, i) => {
    const t = line.trim();
    const phone = /^\+?[\d\s()-]{10,18}$/.test(t);
    return <span key={i} style={{ display: 'block', minHeight: '1.4em' }}>{phone ? <a href={'tel:' + t.replace(/[^\d+]/g, '')}>{t}</a> : inline(line, i)}</span>;
  });
}
