# Stats ORM Refactor — Spec

> 日期：2026-07-04
> 类型：重构（无行为变更）

## 目标

把 `stats.ts` 里 `groupBy` 的原始 `db.all(sql\`...\`)` 聚合查询改为 Drizzle 的 `db.select({...})` query builder。副产品：query builder 在 libsql 与 D1 sqlite-proxy 两种 driver 下都返回**命名对象**，因此可删除为兼容“位置数组 vs 对象”而加的 `normalizeStatsRow` hack。

## 为什么保留一个 `sql` 片段

`json_extract(metadata, '$.<dimension>')` 是对 JSON 文本列的表达式，不是普通列，纯 builder 无法表达——这一段继续用 `sql` 片段包裹，其余（select/where/groupBy/orderBy/count）全部走 builder。

## 需要更改的文件（全部）

| 文件 | 改动 |
|---|---|
| `packages/server/src/services/stats.ts` | 重写 `groupBy` 用 `db.select({ value, count: count() }).from(replies).where(...).groupBy(...).orderBy(desc(count()))`；**删除** `normalizeStatsRow` 函数及其注释；imports 增加 `count, desc`（drizzle-orm）+ `replies`（@hynote/database），移除不再需要的部分 |
| `packages/server/tests/stats.test.ts` | 移除 `normalizeStatsRow` 的 import 与对应 `describe` 块（3 个用例）；保留 `queryStats` 的 3 个用例（预置面板、动态维度、白名单拒绝）不变 |

**不变**：`queryStats` 签名、`UnknownDimensionError`、`DIMENSION_WHITELIST`；因此 `app.ts`、`agent/tools/db.ts` 等所有调用方无需改动。

## 目标代码（groupBy）

```ts
import { sql, count, desc, type SQL } from 'drizzle-orm';
import { replies, type Db } from '@hynote/database';
import type { StatsPanel } from '@hynote/shared';

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
```

## 验证

1. `bun run test` — stats 用例（3 个）通过；总数从 37 → 34（移除 3 个 normalizeStatsRow 用例）。
2. `bunx tsc -p packages/server/tsconfig.json --noEmit` — clean。
3. **Live D1 实测**（关键假设验证）：`GET /api/stats` 与 `?dimension=platform` 返回正确的命名结果与计数——确认 query builder 在 sqlite-proxy 下映射成命名对象（若不成立则回滚）。
