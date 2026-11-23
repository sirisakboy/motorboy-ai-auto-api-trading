import { handleCloudflareApiRequest, type CloudflareEnv } from './apiHandler';
import type { EdgeExecutionContext } from './rssAndAnalysisEngine';

export default {
  async fetch(
    request: Request,
    env: CloudflareEnv,
    ctx?: EdgeExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return handleCloudflareApiRequest(request, env, ctx);
    }

    if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      return env.ASSETS.fetch(request);
    }

    return new Response('Static assets binding missing', { status: 500 });
  },
};
