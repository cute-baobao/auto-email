import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { SkillManifest, SkillOutput } from '@hynote/shared';

export function parseSkill(raw: string): SkillManifest {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error('SKILL.md is missing frontmatter');
  const fm = (parseYaml(m[1]!) ?? {}) as {
    name?: string;
    description?: string;
    allowed_tools?: string[];
    output?: SkillOutput;
  };
  if (!fm.name || !fm.description) {
    throw new Error('SKILL.md frontmatter must include name and description');
  }
  return {
    name: fm.name,
    description: fm.description,
    allowedTools: fm.allowed_tools ?? [],
    output: fm.output ?? 'text',
    body: m[2]!.trim(),
  };
}

export async function loadSkills(dir: string): Promise<SkillManifest[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const skills: SkillManifest[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    try {
      const raw = await readFile(join(dir, e.name, 'SKILL.md'), 'utf8');
      skills.push(parseSkill(raw));
    } catch {
      // directory without a SKILL.md — skip
    }
  }
  return skills;
}
