# partner 状态统计维度 — 设计（spec）

> 日期：2026-07-04
> 类型：只读统计维度扩展（server），无 update/delete
> 关联：`docs/2026-07-04-ai-db-insert-tool-design.md`、`docs/2026-07-03-hynote-email-agent-design.md`

## 1. 目标

让 `/api/stats?dimension=status`（及 `db_query_stats({dimension:'status'})`）能按 `metadata.status` 分组，从而查看 partner 的申请状态统计（applied / notified / …）。partner 行由 `record` 技能写入，`metadata={"status":"applied"}`。

范围：`packages/server`。只读，不新增写能力。

## 2. 决策

| 议题 | 决定 |
|---|---|
| 维度 | 在统计白名单加 `status`，按 `json_extract(metadata,'$.status')` 分组 |
| 过滤 | 不按 template 过滤——`status` 是通用 metadata 维度；当前仅 partner 行有该字段，故即 partner 状态统计 |
| 提示 | `stats` 技能示例维度加 `status`（+ 同步已播种副本） |
| 写能力 | 不做（标记已通知=update，另行设计） |

## 3. 设计

### 3.1 `packages/server/src/services/stats.ts`
`DIMENSION_WHITELIST` 追加 `'status'`：
```ts
const DIMENSION_WHITELIST = [
  'template',
  'promotion_date',
  'promotion_quarter',
  'platform',
  'user_id_status',
  'status',
];
```
其余逻辑不变（`groupBy` 已支持任意白名单键的 `json_extract` 分组）。

### 3.2 `packages/server/src/assets/skills/stats/SKILL.md`
把 `status` 加进正文的示例维度（如 `platform, promotion_date, user_id_status, status`），使 AI 把「看 partner 状态 / 申请状态」映射到 `db_query_stats({dimension:'status'})`。改完 `cp` 到 `~/.bao-auto-mail/skills/stats/SKILL.md`（seeding 只补缺失）。

## 4. 测试 / 验证
- `packages/server/tests/stats.test.ts` 追加：
  - seed 若干 `metadata:{status:'applied'}` / `{status:'notified'}` 行，`queryStats(db,'status')` 返回按 status 分组的计数（applied、notified）。
  - `'status'` 不被 `UnknownDimensionError` 拒绝（即上面能正常返回，不抛错）。
- 真实终端/接口：`/api/stats?dimension=status` 返回 `partner applied=7`（当前数据）。

## 5. 改动文件
| 文件 | 改动 |
|---|---|
| `packages/server/src/services/stats.ts` | `DIMENSION_WHITELIST` 加 `'status'` |
| `packages/server/src/assets/skills/stats/SKILL.md` | 示例维度加 `status`（+ 同步 `~/.bao-auto-mail`） |
| `packages/server/tests/stats.test.ts` | 加 `status` 分组用例 |

## 6. 风险
- `status` 是通用维度：将来别的行也写 `metadata.status` 会一并计入（当前仅 partner 有，暂无影响）。若日后要「仅 partner 的 status」，再加 template 过滤（届时另设计）。
