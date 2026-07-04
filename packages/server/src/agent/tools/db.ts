import { tool } from 'ai';
import { z } from 'zod';
import { getTableColumns } from 'drizzle-orm';
import { WRITABLE_TABLES, type Db } from '@hynote/database';
import { queryStats } from '../../services/stats';

export async function insertRow(
  db: Db,
  table: string,
  values: Record<string, string | number | null>,
): Promise<{ inserted: number; id: string }> {
  const t = WRITABLE_TABLES[table];
  if (!t) throw new Error(`Table not allowed for insert: ${table}`);
  const cols = getTableColumns(t);
  const row: Record<string, string | number | null> = {};
  for (const [key, val] of Object.entries(values)) {
    if (!(key in cols)) throw new Error(`Unknown column: ${table}.${key}`);
    row[key] = val;
  }
  let pkKey = '';
  for (const [key, def] of Object.entries(cols)) {
    if (def.primary) pkKey = key;
    if (key in row) continue;
    if (def.primary && !def.hasDefault) row[key] = crypto.randomUUID();
    else if (def.notNull && !def.hasDefault) throw new Error(`Missing required column: ${table}.${key}`);
  }
  await db.insert(t).values(row as typeof t.$inferInsert);
  const id = pkKey && typeof row[pkKey] === 'string' ? (row[pkKey] as string) : '';
  return { inserted: 1, id };
}

export function dbTools(db: Db) {
  return {
    db_query_stats: tool({
      description:
        'Aggregate reply statistics. Omit dimension for the 3 preset panels; pass a metadata key to group by it.',
      inputSchema: z.object({ dimension: z.string().optional() }),
      execute: async ({ dimension }) => queryStats(db, dimension),
    }),
    db_insert: tool({
      description:
        'Insert ONE row into an allowed database table (INSERT only — cannot update or delete). Use the provided schema to choose the table and column names (TS property names).',
      inputSchema: z.object({
        table: z.string(),
        values: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
      }),
      execute: async ({ table, values }) => insertRow(db, table, values),
    }),
  };
}
