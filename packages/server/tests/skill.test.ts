import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseSkill, loadSkills } from '../src/agent/skill';

describe('parseSkill', () => {
  it('parses frontmatter and body', () => {
    const s = parseSkill(
      '---\nname: reply\ndescription: reply to email\nallowed_tools: [template_list]\noutput: reply\n---\nDo the thing.',
    );
    expect(s).toEqual({
      name: 'reply',
      description: 'reply to email',
      allowedTools: ['template_list'],
      output: 'reply',
      body: 'Do the thing.',
    });
  });
  it('defaults output to text and tools to empty', () => {
    const s = parseSkill('---\nname: x\ndescription: y\n---\nbody');
    expect(s.output).toBe('text');
    expect(s.allowedTools).toEqual([]);
  });
  it('throws without frontmatter', () => {
    expect(() => parseSkill('no frontmatter')).toThrow();
  });
});

describe('loadSkills', () => {
  it('loads skills from subdirectories, skipping dirs without SKILL.md', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skills-'));
    await mkdir(join(dir, 'reply'));
    await writeFile(join(dir, 'reply', 'SKILL.md'), '---\nname: reply\ndescription: d\noutput: reply\n---\nb');
    await mkdir(join(dir, 'empty'));
    const skills = await loadSkills(dir);
    expect(skills.map((s) => s.name)).toEqual(['reply']);
  });
});
