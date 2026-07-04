import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, cp, readFile, writeFile, access } from 'node:fs/promises';
import { AppConfigSchema, type AppConfig } from '@hynote/shared';

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), 'assets');

const DEFAULT_CONFIG = {
  providers: {
    default: 'deepseek',
    deepseek: { base_url: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
    openai: { base_url: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  },
};

export function defaultConfigDir(): string {
  return join(homedir(), '.bao-auto-mail');
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export async function ensureConfigDir(base = defaultConfigDir()): Promise<void> {
  await mkdir(base, { recursive: true });
  const templatesDir = join(base, 'templates');
  const skillsDir = join(base, 'skills');
  if (!(await exists(templatesDir))) {
    await cp(join(ASSETS, 'templates'), templatesDir, { recursive: true });
  }
  if (!(await exists(skillsDir))) {
    await cp(join(ASSETS, 'skills'), skillsDir, { recursive: true });
  }
  const cfgPath = join(base, 'config.json');
  if (!(await exists(cfgPath))) {
    await writeFile(cfgPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
  }
}

export async function loadConfig(base = defaultConfigDir()): Promise<AppConfig> {
  const raw = await readFile(join(base, 'config.json'), 'utf8');
  return AppConfigSchema.parse(JSON.parse(raw));
}
