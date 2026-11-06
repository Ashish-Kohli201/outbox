import test from 'node:test';
import assert from 'node:assert/strict';
import { encrypt, decrypt } from '../lib/crypto.js';

const SECRET = 'a-test-secret-that-is-long-enough-123';

test('round trip', async () => assert.equal(await decrypt(await encrypt('AIza-key', SECRET), SECRET), 'AIza-key'));
test('ciphertext is random per call', async () => assert.notEqual(await encrypt('x', SECRET), await encrypt('x', SECRET)));
test('wrong secret fails', async () => { const c = await encrypt('x', SECRET); await assert.rejects(decrypt(c, SECRET + 'nope')); });
test('short secret is refused', async () => assert.rejects(encrypt('x', 'short')));
