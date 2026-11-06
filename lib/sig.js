// Signatures: drafts carry no signature; it is appended at send time so the user can switch it per email.
export function pickSig(p, id) {
  const list = p.signatures?.length ? p.signatures : [];
  return list.find(s => s.id === id) || list.find(s => s.id === p.defaultSignature) || list[0] || { id: 'none', name: 'None', text: '' };
}
export function withSig(body, sig) {
  const b = String(body || '').trimEnd();
  const text = String(sig?.text || '').trim();
  if (!text) return b;
  const marker = text.split('\n').map(l => l.trim()).find(l => l && !/^(best|regards|thanks|thank you|warm|kind|sincerely|cheers)/i.test(l));
  if (marker && b.slice(-400).includes(marker)) return b; // already signed
  return b + '\n\n' + text;
}
