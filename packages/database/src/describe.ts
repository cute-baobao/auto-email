import { getTableColumns } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { replies } from './schema';

// Tables the AI is allowed to INSERT into (insert-only).
export const WRITABLE_TABLES: Record<string, SQLiteTable> = { replies };

// Compact schema summary injected into the AI prompt. Column names are the
// Drizzle TS property names (what db.insert().values() expects).
export function describeSchema(): string {
  const lines: string[] = [];
  for (const [name, table] of Object.entries(WRITABLE_TABLES)) {
    lines.push(`Table ${name}:`);
    for (const [col, def] of Object.entries(getTableColumns(table))) {
      const flags = [
        def.primary ? 'PRIMARY KEY' : '',
        def.notNull ? 'NOT NULL' : 'nullable',
        def.hasDefault ? 'has default' : '',
      ].filter(Boolean).join(', ');
      lines.push(`- ${col} (${def.dataType})${flags ? ` [${flags}]` : ''}`);
    }
  }
  return `Database schema (insert-only):\n${lines.join('\n')}`;
}
