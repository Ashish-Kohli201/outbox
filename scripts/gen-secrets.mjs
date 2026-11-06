// Prints the random secrets and push keys you need. Nothing is saved or sent anywhere.
//   node scripts/gen-secrets.mjs
import { randomBytes, generateKeyPairSync } from 'node:crypto';

const rand = n => randomBytes(n).toString('base64url');
const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const pub = publicKey.export({ format: 'jwk' }), prv = privateKey.export({ format: 'jwk' });
const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')]).toString('base64url');

console.log(`# Paste these into your Cloudflare Worker settings (Variables and Secrets). Keep them private.

APP_SECRET=${rand(32)}
CRON_SECRET=${rand(24)}

# Optional: push notifications (web push needs these three)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=${raw}
VAPID_PRIVATE_KEY=${prv.d}
VAPID_EMAIL=you@example.com
`);
