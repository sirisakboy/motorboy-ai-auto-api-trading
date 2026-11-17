import { handleCloudflareApiRequest, type CloudflareEnv } from '../../src/cloudflare/apiHandler';

interface PagesFunctionContext {
  request: Request;
  env: CloudflareEnv;
}

export async function onRequest(context: PagesFunctionContext): Promise<Response> {
  return handleCloudflareApiRequest(context.request, context.env);
}
