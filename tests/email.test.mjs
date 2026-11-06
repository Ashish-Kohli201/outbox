import test from 'node:test';
import assert from 'node:assert/strict';
import { toHtml, toPlain } from '../lib/mimehtml.js';
import { withSig, pickSig } from '../lib/sig.js';

test('markdown links, bold, bare links, emails and phone lines become HTML', () => {
  const h = toHtml('Hi **there**\n+91 98765 43210\n[LinkedIn](https://l.in/x) and me@x.com https://x.com/a?b=1&c=2');
  assert.match(h, /<b>there<\/b>/);
  assert.match(h, /href="tel:\+919876543210"/);
  assert.match(h, /<a href="https:\/\/l\.in\/x">LinkedIn<\/a>/);
  assert.match(h, /href="mailto:me@x\.com"/);
  assert.match(h, /b=1&amp;c=2/);
});

test('html is escaped', () => assert.match(toHtml('<script>alert(1)</script>'), /&lt;script&gt;/));

test('plain text keeps the link target', () => assert.equal(toPlain('**Hi** [LinkedIn](https://l.in/x)'), 'Hi LinkedIn: https://l.in/x'));

test('signature is appended once', () => {
  const sig = { id: 'a', text: 'Best regards,\nJane Doe\n+1 555 0100' };
  const once = withSig('Hello', sig);
  assert.ok(once.endsWith('Jane Doe\n+1 555 0100'));
  assert.equal(withSig(once, sig), once);
});

test('pickSig falls back to the default, then the first', () => {
  const p = { signatures: [{ id: 'a', text: '1' }, { id: 'b', text: '2' }], defaultSignature: 'b' };
  assert.equal(pickSig(p, 'zzz').id, 'b');
  assert.equal(pickSig(p, 'a').id, 'a');
});
