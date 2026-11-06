import test from 'node:test';
import assert from 'node:assert/strict';
import { localParts } from '../lib/tz.js';

test('localParts follows the timezone', () => {
  const at = new Date('2026-01-01T20:00:00Z');
  assert.deepEqual(localParts('Asia/Kolkata', at), { date: '2026-01-02', mins: 90, day: 2 });
  assert.equal(localParts('America/New_York', at).mins, 15 * 60);
  assert.equal(localParts('Not/AZone', at).mins, 20 * 60); // bad names fall back to UTC
});
