// Cloudflare Worker entry: /api/* goes to the API, everything else is served from /public
import { onRequest } from '../functions/api/[[path]].js';
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      const path = url.pathname.slice(5).split('/').filter(Boolean);
      return onRequest({ request, env, ctx, params: { path } });
    }
    return env.ASSETS.fetch(request);
  }
};
