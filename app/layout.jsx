import './globals.css';
import { Bricolage_Grotesque, Public_Sans } from 'next/font/google';
import Nav from './nav';
import AuthSync from './auth-sync';

const display = Bricolage_Grotesque({ subsets: ['latin'], axes: ['wdth', 'opsz'], variable: '--font-display' });
const body = Public_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-body' });

export const metadata = { title: 'Outbox', description: 'An open-source job-search autopilot: drop any lead, get a personal email drafted in your voice, send it with one tap.', manifest: '/manifest.webmanifest', icons: { icon: '/icon-192.png', apple: '/icon-192.png' } };
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#14213D' };

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <div className="stripe" aria-hidden="true" />
        <div className="wrap">{children}</div>
        <Nav />
        <AuthSync />
      </body>
    </html>
  );
}
