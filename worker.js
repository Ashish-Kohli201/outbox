// Wraps the OpenNext app so Cloudflare's cron can call /api/cron directly (no GitHub Actions needed).
import app from './.open-next/worker.js';

export default {
  fetch: app.fetch,
  async scheduled(event, env, ctx) {
    const url = `${env.APP_URL || 'https://outbox.internal'}/api/cron?key=${env.CRON_SECRET}`;
    ctx.waitUntil(app.fetch(new Request(url), env, ctx));
  }
};
