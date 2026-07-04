import 'dotenv/config';
import { join } from 'node:path';
import { createD1Client } from '@hynote/database';
import { createApp } from './app';
import { createAiService } from './services/ai';
import { ensureConfigDir, loadConfig, defaultConfigDir } from './config';

const base = defaultConfigDir();
await ensureConfigDir(base);
const config = await loadConfig(base);

const db = createD1Client({
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
  databaseId: process.env.CLOUDFLARE_DATABASE_ID!,
  token: process.env.CLOUDFLARE_D1_TOKEN!,
});

const app = createApp({
  db,
  templatesDir: join(base, 'templates'),
  skillsDir: join(base, 'skills'),
  ai: createAiService(config),
});

export default {
  port: Number(process.env.HYNOTE_PORT ?? 3000),
  fetch: app.fetch,
};
