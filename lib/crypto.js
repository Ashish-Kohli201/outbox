// Encrypts secrets users hand us (their Gemini key, Gmail tokens) before they touch the database.
// AES-256-GCM, key derived from APP_SECRET. Pure Web Crypto, so it runs on Workers and in Node tests.
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = u8 => btoa(String.fromCharCode(...u8));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function key(secret) {
  if (!secret || secret.length < 16) throw new Error('APP_SECRET is missing or too short (use 32+ random characters).');
  const h = await crypto.subtle.digest('SHA-256', enc.encode('outbox:v1:' + secret));
  return crypto.subtle.importKey('raw', h, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encrypt(plain, secret = process.env.APP_SECRET) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(secret), enc.encode(plain)));
  return 'v1.' + b64(iv) + '.' + b64(ct);
}

export async function decrypt(token, secret = process.env.APP_SECRET) {
  const [v, iv, ct] = String(token || '').split('.');
  if (v !== 'v1' || !iv || !ct) throw new Error('Bad ciphertext');
  return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await key(secret), unb64(ct)));
}
