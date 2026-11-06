/** Wall-clock parts in a timezone (IANA name like "Asia/Kolkata"). Bad names fall back to UTC. */
export function localParts(tz, at = new Date()) {
  const make = zone => new Intl.DateTimeFormat('en-CA', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  let f;
  try { f = make(tz || 'UTC'); } catch { f = make('UTC'); }
  const o = Object.fromEntries(f.formatToParts(at).map(p => [p.type, p.value]));
  return { date: `${o.year}-${o.month}-${o.day}`, mins: Number(o.hour) * 60 + Number(o.minute), day: Number(o.day) };
}
