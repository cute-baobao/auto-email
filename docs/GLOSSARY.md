# 术语表（GLOSSARY）

项目内领域术语速查，避免代码和文档混用。

| 术语 | 英文 | 含义 |
|---|---|---|
| 回复 | reply | AI 根据邮件内容选模板、填变量、生成回复正文。结果可用 `Ctrl+Y` 确认并复制入库 |
| 技能 | skill | 一个能力单元（`~/.bao-auto-mail/skills/<name>/SKILL.md`），声明名称、描述、允许工具、输出类型。内置 `reply`/`stats`/`record`，可扩展 |
| 模板 | template | 存放在 `~/.bao-auto-mail/templates/*.md` 的回复模板。变量用 `{{firstName}}` 双花括号。AI 调用 `template_fill` 填充 |
| 工具 | tool | AI SDK 的可调用函数（`template_list`、`db_insert`、`get_current_date` 等）。每个 skill 只能调用其 `allowed_tools` 列表里的工具，作为权限边界 |
| 确认 | confirm | reply 结果中 `template` 非空时弹出的选项菜单（确认并复制 / 编辑 / 取消），用户批准后才写入 D1 |
| 审核 | review | db_insert / db_query 执行前弹出的审核卡片（确认执行 / 取消），用户批准后才调 `/api/execute` |
| 路由 | route / routing | 无斜杠纯文字输入时，AI 按 skill description 自动选择最匹配的技能（`routeSkill`） |
| 播种 | seed | 首次运行 `auto-email` 时自动从 `packages/server/src/assets/` 拷贝内置模板和技能到 `~/.bao-auto-mail/` |
| SSE | Server-Sent Events | `/api/run/stream` 的传输协议——服务端逐事件推送给 CLI，实现流式渲染 |
| parts | parts | `BotMessage` 渲染的最小单元数组。`eventsToParts(events)` 把 SSE 事件转换成 `AutoEmailMessagePart[]`（reasoning/tool/text），再按 `groupConsecutiveParts` 合并连续同类型 part 渲染 |
| 降级 | fallback | AI 调用失败时（502 `fallback:'manual'`），CLI 弹出模板选择 dialog 让用户手动选模板，不阻断工作流 |
| 元数据 | metadata | `replies` 表的一个 JSON 字段（`{"platform":"YouTube","user_id_status":"applied"}`）。AI 自动提取 + 用户确认，统计时按 key 分组。新增维度零迁移 |

## 技能简称一览

| 名称 | 触发 | 输出类型 | 说明 |
|---|---|---|---|
| `reply` | `/reply` + 邮件 / 纯文字自动路由 | `reply` | 模板填充回复，template 非空→确认 |
| `stats` | `/stats` / "看统计" 自动路由 | `stats` | 聚合统计面板，`?dimension=status` 等 |
| `record` | "记录到数据库" 自动路由 | `text` | 调用 db_insert/db_query 写入/查询数据，需审核 |

## 工具简称一览

| 名称 | 类型 | 说明 |
|---|---|---|
| `template_list` | 只读 | 列出所有模板名和预览 |
| `template_get` | 只读 | 按名获取模板正文 |
| `template_fill` | 只读 | 用变量填充模板，返回文本 |
| `db_query_stats` | 只读 | 聚合统计（3 预置 + 动态维度） |
| `db_insert` | 写（需审核） | INSERT 一行到白名单表 |
| `db_query` | 只读（需审核） | SELECT 白名单表 |
| `get_current_date` | 只读 | 返回当前 UTC 日期/时间 |

## 结果类型一览（`RunResponse.type`）

| type | 说明 | 确认/审核 |
|---|---|---|
| `reply` | AI 生成的邮件回复 | template 非空 → ConfirmMenu |
| `stats` | 统计面板 | 无 |
| `text` | 纯文本回复（普通对话 / 记录完成提示） | 无 |
| `db-insert` | 待插行的 INSERT 参数 | ReviewCard |
| `db-query` | 待查询的 SELECT 参数 | ReviewCard |
