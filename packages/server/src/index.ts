import 'dotenv/config';
import { join } from 'node:path';
import { createD1Client } from '@auto-email/database';
import { createApp } from './app';
import { createAiService } from './services/ai';
import { ensureConfigDir, loadConfig, defaultConfigDir } from './config';

const base = defaultConfigDir();
await ensureConfigDir(base);
const config = await loadConfig(base);

const requiredD1Env = [
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_DATABASE_ID',
  'CLOUDFLARE_D1_TOKEN',
] as const;
const missingD1Env = requiredD1Env.filter((k) => !process.env[k]);
if (missingD1Env.length > 0) {
  throw new Error(`Missing ${missingD1Env.join(', ')} in environment`);
}

const db = createD1Client({
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID as string,
  databaseId: process.env.CLOUDFLARE_DATABASE_ID as string,
  token: process.env.CLOUDFLARE_D1_TOKEN as string,
});

const app = createApp({
  db,
  templatesDir: join(base, 'templates'),
  skillsDir: join(base, 'skills'),
  ai: createAiService(config),
});

export default {
  port: Number(process.env.AUTO_EMAIL_PORT ?? 45678),
  fetch: app.fetch,
};
