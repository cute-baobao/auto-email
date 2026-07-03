import type { ToolSet } from 'ai';
import type { Db } from '@hynote/database';
import { templateTools } from './template';
import { dbTools } from './db';

export function buildToolRegistry(deps: { templatesDir: string; db: Db }): ToolSet {
  return { ...templateTools(deps.templatesDir), ...dbTools(deps.db) } as ToolSet;
}

export function pickTools(registry: ToolSet, allowed: string[]): ToolSet {
  const picked: ToolSet = {};
  for (const name of allowed) {
    if (registry[name]) picked[name] = registry[name]!;
  }
  return picked;
}
