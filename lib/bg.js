// Run work after the response is sent (Cloudflare waitUntil); locally it just runs un-awaited.
import { getCloudflareContext } from '@opennextjs/cloudflare';
export function bg(promise) {
  const p = Promise.resolve(promise).catch(() => {});
  try { getCloudflareContext().ctx.waitUntil(p); } catch (e) { /* local dev */ }
}
