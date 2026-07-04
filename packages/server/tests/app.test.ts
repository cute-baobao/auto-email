import { describe, it, expect, beforeAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createTestDb } from '@hynote/database/test';
import { replies, type Db } from '@hynote/database';
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
    async *streamSkill(skill) {
      yield { type: 'skill-selected', skill: skill.name };
      yield { type: 'tool-call', toolCallId: 't1', toolName: 'template_list', args: {} };
      yield { type: 'tool-result', toolCallId: 't1', result: [{ name: 'kol-media-support' }] };
      if (skill.output === 'reply') {
        yield { type: 'result', result: { type: 'reply', skill: skill.name, template: 'kol-media-support', reply: 'Hi Alex!', metadata: { platform: 'YouTube' }, email_name: 'Alex' } };
      } else {
        yield { type: 'result', result: { type: 'text', skill: skill.name, text: 'ok' } };
      }
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
  it('routes via ai.routeSkill when no skill is provided', async () => {
    let routed = false;
    const app = createApp({
      db, templatesDir, skillsDir,
      ai: fakeAi({
        async routeSkill(_input, skills) {
          routed = true;
          return skills.find((s) => s.name === 'reply')!.name;
        },
      }),
    });
    const res = await app.request('/api/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: 'promote on youtube' }),
    });
    expect(res.status).toBe(200);
    expect(routed).toBe(true);
    const body = (await res.json()) as RunResponse;
    expect(body).toMatchObject({ type: 'reply', template: 'kol-media-support' });
  });
  it('returns 400 with fallback:manual for an unknown explicit skill', async () => {
    const app = createApp({ db, templatesDir, skillsDir, ai: fakeAi() });
    const res = await app.request('/api/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: 'x', skill: 'nope' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).fallback).toBe('manual');
  });
  it('returns 400 when input is missing (zValidator rejects)', async () => {
    const app = createApp({ db, templatesDir, skillsDir, ai: fakeAi() });
    const res = await app.request('/api/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: '' }),
    });
    expect(res.status).toBe(400);
  });
  it('forwards a text-typed runSkill response unchanged', async () => {
    const app = createApp({
      db, templatesDir, skillsDir,
      ai: fakeAi({
        async runSkill(skill) {
          return { type: 'text', skill: skill.name, text: 'plain answer' };
        },
      }),
    });
    const res = await app.request('/api/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: 'x', skill: 'reply' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as RunResponse;
    expect(body).toMatchObject({ type: 'text', text: 'plain answer' });
  });
});

describe('POST /api/run/stream', () => {
  it('streams progress events and a final result as SSE', async () => {
    const app = createApp({ db, templatesDir, skillsDir, ai: fakeAi() });
    const res = await app.request('/api/run/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: 'promote on youtube', skill: 'reply' }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const text = await res.text();
    expect(text).toContain('event: skill-selected');
    expect(text).toContain('event: tool-call');
    expect(text).toContain('event: result');
    expect(text).toContain('event: done');
    expect(text).toContain('kol-media-support');
  });
});

describe('GET /api/templates', () => {
  it('returns the 4 bundled templates with names and bodies', async () => {
    const app = createApp({ db, templatesDir, skillsDir, ai: fakeAi() });
    const res = await app.request('/api/templates');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { templates: { name: string; body: string }[] };
    expect(body.templates).toHaveLength(4);
    expect(body.templates.map((t) => t.name).sort()).toEqual([
      'affiliate-enablement',
      'kol-media-support',
      'technical-support',
      'user-id-trial',
    ]);
    for (const t of body.templates) {
      expect(typeof t.name).toBe('string');
      expect(t.body).toContain('{{firstName}}');
    }
  });
});

describe('GET /api/health', () => {
  it('returns 200 { ok: true }', async () => {
    const app = createApp({ db, templatesDir, skillsDir, ai: fakeAi() });
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
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
  it('returns 400 for an unknown stats dimension', async () => {
    const app = createApp({ db, templatesDir, skillsDir, ai: fakeAi() });
    const res = await app.request('/api/stats?dimension=not_allowed');
    expect(res.status).toBe(400);
  });
});
