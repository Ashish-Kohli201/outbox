import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTailored, validRewrite } from '../lib/cvguard.js';

const master = {
  name: 'JANE DOE', spikes: ['Top 1% of 5,000', 'PPO @ Acme', 'Founder'],
  sections: [
    { title: 'EDUCATION', entries: [{ org: 'Uni', bullets: ['**CGPA 9.1**; ranked 1 of 200'] }] },
    { title: 'WORK', entries: [
      { org: 'A', bullets: ['Grew revenue **30%** in 2 weeks', 'Built a tool used by 50+ people'] },
      { org: 'B', bullets: ['Led 20+ calls'] },
      { line: '**Offers:** X, Y' }
    ] }
  ]
};

test('reordering keeps every bullet and keeps the trailing line last', () => {
  const { cv } = buildTailored({ entryOrder: { 1: [1, 2, 0] }, bulletOrder: { '1.0': [1, 0] } }, master);
  const work = cv.sections[1].entries;
  assert.equal(work[0].org, 'B');
  assert.ok(work[work.length - 1].line);
  assert.equal(work.find(e => e.org === 'A').bullets[0], 'Built a tool used by 50+ people');
});

test('education stays first', () => {
  const { cv } = buildTailored({ sectionOrder: [1, 0] }, master);
  assert.equal(cv.sections[0].title, 'EDUCATION');
});

test('invalid permutations are ignored', () => {
  const { cv } = buildTailored({ bulletOrder: { '1.0': [9, 9] }, entryOrder: { 1: [0, 0, 0] } }, master);
  assert.equal(cv.sections[1].entries[0].bullets.length, 2);
});

test('rewrites must be no longer, add no new numbers, and keep bold balanced', () => {
  const orig = 'Grew revenue **30%** in 2 weeks';
  assert.equal(validRewrite(orig, 'Grew revenue **30%** in 2 wks'), true);
  assert.equal(validRewrite(orig, 'Grew revenue **30%** in 2 weeks and then some more'), false);
  assert.equal(validRewrite(orig, 'Grew revenue **45%** in 2 weeks'), false);
  assert.equal(validRewrite(orig, 'Grew **revenue 30% in 2 weeks'), false);
  assert.equal(validRewrite(orig, 'Grew revenue — 30% in 2 weeks'), false);
});

test('spikes only come from the master', () => {
  const { cv } = buildTailored({ spikes: ['Founder', 'Made up', 'PPO @ Acme', 'Top 1% of 5,000'] }, master);
  assert.deepEqual(cv.spikes, ['Founder', 'PPO @ Acme', 'Top 1% of 5,000']);
});
