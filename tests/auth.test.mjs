import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verify, peek, expired } from '../lib/auth.js';
import { runAs, uid } from '../lib/ctx.js';

const SECRET = 'jwt-secret-for-tests-only';
process.env.SUPABASE_JWT_SECRET = SECRET;
const b64 = o => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
function token(claims, secret = SECRET, alg = 'HS256') {
  const h = b64({ alg, typ: 'JWT' }), p = b64(claims);
  return `${h}.${p}.${createHmac('sha256', secret).update(h + '.' + p).digest('base64url')}`;
}
const future = Math.floor(Date.now() / 1000) + 3600;

test('a valid token yields the user', async () => {
  assert.deepEqual(await verify(token({ sub: 'u1', email: 'a@b.co', exp: future })), { id: 'u1', email: 'a@b.co' });
});
test('a forged signature is rejected', async () => assert.equal(await verify(token({ sub: 'u1', exp: future }, 'wrong-secret')), null));
test('an expired token is rejected', async () => assert.equal(await verify(token({ sub: 'u1', exp: 1 })), null));
test('garbage is rejected', async () => { assert.equal(await verify('nope'), null); assert.equal(await verify(''), null); });
test('peek reads claims and expiry', () => { assert.equal(peek(token({ sub: 'x', exp: future })).sub, 'x'); assert.equal(expired(peek(token({ exp: 1 }))), true); });

test('concurrent requests never see each other\'s user', async () => {
  const seen = await Promise.all(['a', 'b', 'c', 'd'].map(id => runAs(id, async () => {
    await new Promise(r => setTimeout(r, Math.random() * 20));
    return uid();
  })));
  assert.deepEqual(seen, ['a', 'b', 'c', 'd']);
});
test('no user outside a request', () => assert.throws(() => uid(), /Not signed in/));
