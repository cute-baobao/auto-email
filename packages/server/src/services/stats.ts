import { sql } from 'drizzle-orm';
import type { Db } from '@hynote/database';
import type { StatsPanel } from '@hynote/shared';

export class UnknownDimensionError extends Error {}

// `db.all(sql`raw`)` yields objects under libsql (tests) but positional arrays
// under the D1 sqlite-proxy (production). Normalize both to {value, count}.
export function normalizeStatsRow(row: unknown): { value: string | null; count: number } {
  const [value, count] = Array.isArray(row)
    ? [row[0], row[1]]
    : [(row as Record<string, unknown>).value, (row as Record<string, unknown>).count];
  return { value: (value as string | null) ?? null, count: Number(count) };
}

const DIMENSION_WHITELIST = [
  'template',
  'promotion_date',
  'promotion_quarter',
  'platform',
  'user_id_status',
];

async function groupBy(db: Db, dimension: string): Promise<StatsPanel> {
  const expr =
    dimension === 'template'
      ? sql`template`
      : sql`json_extract(metadata, ${'$.' + dimension})`;
  const rows = (await db.all(sql`
    SELECT ${expr} AS value, COUNT(*) AS count
    FROM replies
    WHERE ${expr} IS NOT NULL
    GROUP BY 1
    ORDER BY count DESC
  `)) as unknown[];
  return {
    title: dimension,
    rows: rows.map((row) => {
      const { value, count } = normalizeStatsRow(row);
      return { label: value ?? '未明确', count };
    }),
  };
}

export async function queryStats(db: Db, dimension?: string): Promise<StatsPanel[]> {
  if (dimension) {
    if (!DIMENSION_WHITELIST.includes(dimension)) {
      throw new UnknownDimensionError(`Unknown stats dimension: ${dimension}`);
    }
    return [await groupBy(db, dimension)];
  }
  return [
    await groupBy(db, 'template'),
    await groupBy(db, 'promotion_date'),
    await groupBy(db, 'user_id_status'),
  ];
}
