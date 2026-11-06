'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

const I = {
  inbox: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7l9 6 9-6"/><rect x="3" y="5" width="18" height="14" rx="2"/></svg>,
  train: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v3M5.6 5.6l2.1 2.1M3 12h3M18 12h3M16.3 7.7l2.1-2.1"/><circle cx="12" cy="14" r="5"/></svg>,
  settings: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>
};

export default function Nav() {
  const p = usePathname();
  useEffect(() => { if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {}); }, []);
  if (p === '/login' || p === '/onboarding') return null;
  const L = (href, label, icon) => {
    const on = href === '/' ? p === '/' || p.startsWith('/item') : p.startsWith(href);
    return <Link href={href} aria-current={on ? 'page' : undefined}>{icon}{label}</Link>;
  };
  return <nav className="bottom" aria-label="Main">{L('/', 'Inbox', I.inbox)}{L('/train', 'Voice', I.train)}{L('/settings', 'Settings', I.settings)}</nav>;
}
