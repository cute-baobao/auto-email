import { describe, it, expect, beforeAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createTestDb, replies, type Db } from '@hynote/database';
import type { AiPort } from '../src/agent/ai-port';
import type { RunResponse, SkillManifest } from '@hynote/shared';
import { createApp } from '../src/app';

const assets = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'assets');
const templatesDir = join(assets, 'templates');
const skillsDir = join(assets, 'skills');

function fakeAi(overrides: Partial<AiPort> = {}): AiPort {
  return {
    async routeSkill(_input: string, skills: SkillManifest[]) {
      return skills[0]!.name;
    },
    async runSkill(skill): Promise<RunResponse> {
      if (skill.output === 'reply') {
        return { type: 'reply', skill: skill.name, template: 'kol-media-support', reply: 'Hi Alex!', metadata: { platform: 'YouTube' }, email_name: 'Alex' };
      }
      return { type: 'text', skill: skill.name, text: 'ok' };
    },
    ...overrides,
  };
}

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

describe('GET /api/skills', () => {
  it('lists bundled skills', async () => {
    const app = createApp({ db, templatesDir, skillsDir, ai: fakeAi() });
    const res = await app.request('/api/skills');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name: string }[];
    expect(body.map((s) => s.name).sort()).toEqual(['reply', 'stats']);
  });
});

describe('POST /api/run', () => {
  it('runs an explicit skill and returns its output', async () => {
    const app = createApp({ db, templatesDir, skillsDir, ai: fakeAi() });
    const res = await app.request('/api/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: 'promote on youtube', skill: 'reply' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as RunResponse;
    expect(body).toMatchObject({ type: 'reply', template: 'kol-media-support' });
  });
  it('returns 502 with fallback:manual when AI throws', async () => {
    const app = createApp({
      db, templatesDir, skillsDir,
      ai: fakeAi({ runSkill: async () => { throw new Error('AI down'); } }),
    });
    const res = await app.request('/api/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: 'x', skill: 'reply' }),
    });
    expect(res.status).toBe(502);
    expect((await res.json()).fallback).toBe('manual');
  });
});

describe('POST /api/reply then GET /api/stats', () => {
  it('persists a reply and reflects it in stats', async () => {
    const app = createApp({ db, templatesDir, skillsDir, ai: fakeAi() });
    const save = await app.request('/api/reply', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ template: 'kol-media-support', reply_content: 'Hi', metadata: { platform: 'YouTube' }, confirmed: true }),
    });
    expect(save.status).toBe(200);
    const stats = await app.request('/api/stats?dimension=platform');
    const body = (await stats.json()) as { panels: { rows: { label: string; count: number }[] }[] };
    expect(body.panels[0]!.rows.find((r) => r.label === 'YouTube')!.count).toBeGreaterThanOrEqual(1);
  });
});
