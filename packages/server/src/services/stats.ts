import { sql } from 'drizzle-orm';
import type { Db } from '@hynote/database';
import type { StatsPanel } from '@hynote/shared';

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
  const rows = await db.all<{ value: string | null; count: number }>(sql`
    SELECT ${expr} AS value, COUNT(*) AS count
    FROM replies
    WHERE ${expr} IS NOT NULL
    GROUP BY 1
    ORDER BY count DESC
  `);
  return {
    title: dimension,
    rows: rows.map((r) => ({ label: r.value ?? '未明确', count: Number(r.count) })),
  };
}

export async function queryStats(db: Db, dimension?: string): Promise<StatsPanel[]> {
  if (dimension) {
    if (!DIMENSION_WHITELIST.includes(dimension)) {
      throw new Error(`Unknown stats dimension: ${dimension}`);
    }
    return [await groupBy(db, dimension)];
  }
  return [
    await groupBy(db, 'template'),
    await groupBy(db, 'promotion_date'),
    await groupBy(db, 'user_id_status'),
  ];
}
