import { handleCloudflareApiRequest, type CloudflareEnv } from './apiHandler';

export default {
  async fetch(request: Request, env: CloudflareEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return handleCloudflareApiRequest(request, env);
    }

    if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      return env.ASSETS.fetch(request);
    }

    return new Response('Static assets binding missing', { status: 500 });
  },
};
