import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../../chatgpt-auth';
import { handleBridge } from '../../../../lib/service.mjs';
export const dynamic = 'force-dynamic';
async function handle(request: Request) {
  return handleBridge(request, { db:env.DB, bucket:env.BUCKET, key:env.OPENAI_API_KEY,
    textModel:env.OPENAI_TEXT_MODEL, imageModel:env.OPENAI_IMAGE_MODEL,
    dailyTextLimit:Number(env.DAILY_TEXT_LIMIT)||40,dailyImageLimit:Number(env.DAILY_IMAGE_LIMIT)||8,
    user:await getChatGPTUser() });
}
export const GET=handle;
export const POST=handle;
export const PATCH=handle;
