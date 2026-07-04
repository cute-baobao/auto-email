import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestDb } from '@auto-email/database/test';
import { replies, type Db } from '@auto-email/database';
import { buildToolRegistry, pickTools } from '../src/agent/tools/index';

let dir: string;
let db: Db;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tools-'));
  await writeFile(join(dir, 'kol-media-support.md'), 'Hi {{firstName}}!');
  db = await createTestDb();
  await db.insert(replies).values({ id: '1', template: 'kol-media-support', replyContent: 'x', metadata: '{"platform":"YouTube"}' });
});

describe('tool registry', () => {
  it('template_fill fills a template', async () => {
    const reg = buildToolRegistry({ templatesDir: dir, db });
    const out = await reg.template_fill!.execute!({ name: 'kol-media-support', vars: { firstName: 'Alex' } }, {} as any);
    expect(out).toBe('Hi Alex!');
  });
  it('db_query_stats returns panels', async () => {
    const reg = buildToolRegistry({ templatesDir: dir, db });
    const out = await reg.db_query_stats!.execute!({ dimension: 'platform' }, {} as any);
    expect((out as any)[0].rows[0].label).toBe('YouTube');
  });
  it('pickTools returns only allowed tools', () => {
    const reg = buildToolRegistry({ templatesDir: dir, db });
    expect(Object.keys(pickTools(reg, ['template_list']))).toEqual(['template_list']);
  });
});
