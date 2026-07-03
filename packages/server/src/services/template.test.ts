import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listTemplates, getTemplate, fillTemplate } from './template';

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tmpl-'));
  await writeFile(join(dir, 'kol-media-support.md'), 'Hi {{firstName}}, welcome!');
  await writeFile(join(dir, 'user-id-trial.md'), 'Hi {{firstName}}, send your ID.');
});

describe('template service', () => {
  it('lists template names', async () => {
    const names = (await listTemplates(dir)).map((t) => t.name).sort();
    expect(names).toEqual(['kol-media-support', 'user-id-trial']);
  });
  it('gets raw template', async () => {
    expect(await getTemplate(dir, 'kol-media-support')).toContain('{{firstName}}');
  });
  it('fills variables and leaves unknown placeholders intact', () => {
    expect(fillTemplate('Hi {{firstName}} {{x}}', { firstName: 'Alex' })).toBe('Hi Alex {{x}}');
  });
});
