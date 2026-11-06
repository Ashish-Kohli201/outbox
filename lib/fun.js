'use client';
export const STAMP = {
  queued: ['⏳', '#E7ECFA'], processing: ['✍️', '#E7ECFA'], review: ['📝', '#FFF1B8'], error: ['⚠️', '#FDE2DF'],
  sent: ['✈️', '#E3EAFF'], follow: ['⏰', '#FFE7C2'], replied: ['💬', '#FFE7C2'], interview: ['🎉', '#D9F2E5'],
  closed: ['📪', '#ECEEF2'], skipped: ['🙈', '#ECEEF2'], scheduled: ['⏰', '#E3EAFF']
};
export function greeting(name = '') {
  const h = new Date().getHours(), n = name ? ', ' + name : '';
  return (h < 5 ? 'Up late' : h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening') + n;
}
export function confetti() {
  if (typeof window === 'undefined' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = document.createElement('canvas'); c.className = 'confetti'; document.body.append(c);
  const x = c.getContext('2d'), W = (c.width = innerWidth), H = (c.height = innerHeight);
  const cols = ['#D52B1E', '#F9C80E', '#1E3FA0', '#1C7C54'];
  const ps = Array.from({ length: 90 }, () => ({ x: W / 2, y: H * 0.7, vx: (Math.random() - 0.5) * 12, vy: -Math.random() * 14 - 6, r: Math.random() * 6 + 4, c: cols[(Math.random() * 4) | 0], a: Math.random() * 6 }));
  let t = 0;
  (function f() {
    x.clearRect(0, 0, W, H);
    ps.forEach(p => { p.vy += 0.45; p.x += p.vx; p.y += p.vy; p.a += 0.2; x.save(); x.translate(p.x, p.y); x.rotate(p.a); x.fillStyle = p.c; x.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); x.restore(); });
    if (++t < 110) requestAnimationFrame(f); else c.remove();
  })();
}

export function buzz(p = 12) { try { navigator.vibrate?.(p); } catch {} }
