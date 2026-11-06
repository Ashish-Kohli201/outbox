import { addSwipe, swipeCounts } from '@/lib/db';
import { peekCards, dropCard, refillPool } from '@/lib/swipe';
import { rebuildVoice } from '@/lib/voice';
import { bg } from '@/lib/bg';
import { json, wrap } from '@/lib/http';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET -> every waiting card (instant, nothing is removed). An empty pool is refilled in the background; the page retries.
export const GET = wrap(async () => {
  const [{ cards, size }, counts] = await Promise.all([peekCards(15), swipeCounts()]);
  if (size < 10) bg(refillPool(15));
  return json({ cards, counts, warming: size === 0 });
});

// POST { v, card, comment } -> saved, and the card leaves the pool. Every 10th swipe refreshes the voice guide.
export const POST = wrap(async req => {
  const { v, card, comment } = await req.json();
  if (!['like', 'dislike', 'super'].includes(v) || !card?.body) return json({ error: 'Bad swipe' }, 400);
  await addSwipe({ v, subject: card.subject, body: card.body, scenario: card.scenario, lever: card.lever, comment: String(comment || '').slice(0, 400) });
  await dropCard(card.id);
  const counts = await swipeCounts();
  if (counts.total % 10 === 0) bg(rebuildVoice());
  return json({ counts, learned: counts.total % 10 === 0 });
});
