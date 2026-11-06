// Starts drafting right away in the background, so a lead doesn't wait for the next cron tick.
// Cron still picks up anything that gets interrupted (see /api/cron).
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { processItem } from './pipeline';

export function kick(id) {
  const run = processItem(id, { auto: true }).catch(() => {});
  try { getCloudflareContext().ctx.waitUntil(run); } catch (e) { /* local dev: runs un-awaited */ }
}
