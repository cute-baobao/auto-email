import { tool } from 'ai';
import { z } from 'zod';
import { getTableColumns, eq, ne, gt, gte, lt, lte, like, and, desc } from 'drizzle-orm';
import { WRITABLE_TABLES, type Db } from '@auto-email/database';
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

const OPS: Record<string, (col: any, val: any) => any> = { '=': eq, '!=': ne, '>': gt, '>=': gte, '<': lt, '<=': lte, 'LIKE': like };

export async function queryRows(
  db: Db, table: string,
  opts: { columns?: string[]; where?: { column: string; op: string; value: unknown }[]; orderBy?: string; limit?: number },
): Promise<{ rows: Record<string, unknown>[] }> {
  const t = WRITABLE_TABLES[table];
  if (!t) throw new Error(`Table not allowed: ${table}`);
  const cols = getTableColumns(t);
  const selectCols: Record<string, any> = {};
  const names = opts.columns && opts.columns.length > 0 ? opts.columns : Object.keys(cols);
  for (const c of names) {
    if (!(c in cols)) throw new Error(`Unknown column: ${table}.${c}`);
    selectCols[c] = (cols as any)[c];
  }
  let q: any = db.select(selectCols).from(t);
  if (opts.where && opts.where.length > 0) {
    const filters = opts.where.map((w) => {
      const col = (cols as any)[w.column];
      if (!col) throw new Error(`Unknown column: ${table}.${w.column}`);
      const fn = OPS[w.op];
      if (!fn) throw new Error(`Unknown or unsupported op: ${w.op}`);
      return fn(col, w.value);
    });
    q = q.where(and(...filters));
  }
  const limit = Math.min(opts.limit ?? 20, 100);
  q = q.limit(limit);
  if (opts.orderBy) {
    const orderCol = (cols as any)[opts.orderBy];
    if (orderCol) q = q.orderBy(desc(orderCol));
  }
  const rows = await q;
  return { rows };
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
    db_query: tool({
      description: 'SELECT rows from an allowed table. READ-ONLY (cannot insert/update/delete). Use the schema to pick table, columns, optional filters, order, and limit.',
      inputSchema: z.object({
        table: z.string(),
        columns: z.array(z.string()).optional(),
        where: z.array(z.object({
          column: z.string(), op: z.enum(['=', '!=', '>', '<', '>=', '<=', 'LIKE']), value: z.union([z.string(), z.number()]),
        })).optional(),
        orderBy: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      execute: async ({ table, columns, where, orderBy, limit }) =>
        queryRows(db, table, { columns, where, orderBy, limit }),
    }),
  };
}
