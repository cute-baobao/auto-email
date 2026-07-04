import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureConfigDir, loadConfig } from '../src/config';

describe('ensureConfigDir', () => {
  it('seeds templates, skills, and config.json into an empty dir', async () => {
    const home = await mkdtemp(join(tmpdir(), 'home-'));
    await ensureConfigDir(home);
    const templates = await readdir(join(home, 'templates'));
    expect(templates).toContain('kol-media-support.md');
    const skills = await readdir(join(home, 'skills'));
    expect(skills.sort()).toEqual(['record', 'reply', 'stats']);
    const cfg = await loadConfig(home);
    expect(cfg.providers.default).toBeTruthy();
  });
});
