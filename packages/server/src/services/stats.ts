import { sql, count, desc, type SQL } from 'drizzle-orm';
import { replies, type Db } from '@hynote/database';
import type { StatsPanel } from '@hynote/shared';

export class UnknownDimensionError extends Error {}

const DIMENSION_WHITELIST = [
  'template',
  'promotion_date',
  'promotion_quarter',
  'platform',
  'user_id_status',
];

async function groupBy(db: Db, dimension: string): Promise<StatsPanel> {
  const valueExpr: SQL<string | null> =
    dimension === 'template'
      ? sql`${replies.template}`
      : sql`json_extract(${replies.metadata}, ${'$.' + dimension})`;

  const rows = await db
    .select({ value: valueExpr, count: count() })
    .from(replies)
    .where(sql`${valueExpr} IS NOT NULL`)
    .groupBy(valueExpr)
    .orderBy(desc(count()));

  return {
    title: dimension,
    rows: rows.map((r) => ({ label: r.value ?? '未明确', count: Number(r.count) })),
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
