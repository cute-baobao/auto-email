import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface TemplateInfo {
  name: string;
  preview: string;
}

export async function listTemplates(dir: string): Promise<TemplateInfo[]> {
  const files = await readdir(dir);
  const infos: TemplateInfo[] = [];
  for (const f of files) {
    if (!f.endsWith('.md')) continue;
    const raw = await readFile(join(dir, f), 'utf8');
    infos.push({ name: f.replace(/\.md$/, ''), preview: raw.slice(0, 120) });
  }
  return infos;
}

export async function getTemplate(dir: string, name: string): Promise<string> {
  if (name.includes('/') || name.includes('\\') || name.includes('..')) {
    throw new Error(`Invalid template name: ${name}`);
  }
  return readFile(join(dir, `${name}.md`), 'utf8');
}

export function fillTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    key in vars ? vars[key]! : `{{${key}}}`,
  );
}
