# HyNote Email Agent — Streaming 设计（spec）

> 日期：2026-07-04
> 类型：新增功能（流式响应）+ provider 层重构（deepseek-only）
> 关联：`docs/2026-07-03-hynote-email-agent-design.md`、参考 `baocode/docs/ai-streaming.md`

## 1. 目标

把 `/reply` 等 AI 调用从「请求→冻结的『agent 处理中...』→结果」升级为**流式进度**：实时推送 reasoning（思考）、text 增量、tool-call/tool-result，最后用一个 `result` 事件带出结构化结果（reply/stats/text）。支持生成中途取消。

**非目标**：不做 baocode 的会话持久化 / INTERRUPTED 落库 / 自动 resume（hynote 无会话历史，仅在用户确认后存 reply）。

## 2. 关键决策

| 决策 | 选择 |
|---|---|
| 流什么 | 进度事件（reasoning/text/tool）+ 最终 `result` 事件；不逐字符流最终结构化 JSON |
| provider | **deepseek-only**：`@ai-sdk/deepseek`，去掉 `@ai-sdk/openai-compatible` |
| reasoning | 开 `thinking`（DeepSeek V3.1+ thinking 模式支持 tools+reasoning 并存；实现时用真实 key 实测确认） |
| 端点 | 保留 `POST /api/run`（非流式，供现有测试/程序化/降级）；新增 `POST /api/run/stream`（SSE） |
| 取消 | 支持（AbortController + `stream.onAbort`），无 resume |
| 传输 | SSE（Hono `streamSSE`）；客户端 `eventsource-parser` |
| JSON 输出 | 保留现有 `generateText/streamText + 容错 JSON parse`（不用 `generateObject`） |

## 3. 数据流

```
CLI submitRaw ─POST─► /api/run/stream (Hono streamSSE)
   fetch + TextDecoderStream + EventSourceParserStream
        │                                   │
   逐事件渲染进度区 ◄──────── SSE ────────── ai.streamSkill():
   （reasoning/text/tool）                    routeSkill(如无显式 skill)
   result 事件 → 渲染最终面板                  streamText().fullStream 逐 part → 事件
   done 事件 → 收尾                            末尾 generateJson(reply/stats) → result 事件
   Esc ─abort─► stream.onAbort ─► AbortController.abort()
```

## 4. 共享事件协议（`packages/shared`）

`RunStreamEvent`（Zod 判别联合，前后端复用；新增到 `schemas.ts`，类型到 `types.ts`）：

| type | 字段 | 说明 |
|---|---|---|
| `skill-selected` | `skill: string` | 路由或显式选定的 skill |
| `reasoning-delta` | `text: string` | 思考增量（有才发） |
| `text-delta` | `text: string` | 模型中间文本增量 |
| `tool-call` | `toolCallId: string, toolName: string, args: unknown` | 发起工具调用 |
| `tool-result` | `toolCallId: string, result: unknown` | 工具结果 |
| `result` | `result: RunResponse` | 最终结构化结果 |
| `error` | `message: string, fallback?: 'manual'` | 出错（`fallback:'manual'` 触发手动选模板） |
| `done` | `durationMs: number` | 结束 |

新增 `RunStreamEventSchema`（校验用）。`RunResponse` 复用现有类型。

## 5. 服务端（`packages/server`）

### 5.1 provider 重构（deepseek-only）
`services/ai.ts` `resolveModel`：
```ts
import { createDeepSeek } from '@ai-sdk/deepseek';
const ds = createDeepSeek({ apiKey: process.env.DEEPSEEK_API_KEY! });
const model = ds(providerCfg.model);        // 默认 deepseek-chat
const providerOptions = { deepseek: { thinking: { type: 'enabled' }, reasoningEffort: 'high' } };
```
`runSkill`（非流式）与 `streamSkill`（流式）共用 `model` + `providerOptions`。去掉 `createOpenAICompatible`。若 `providers.default !== 'deepseek'`，抛清晰错误（当前仅支持 deepseek）。

### 5.2 `AiPort` 新方法
```ts
streamSkill(skill: SkillManifest, input: string, tools: ToolSet, signal: AbortSignal): AsyncIterable<RunStreamEvent>;
```
保留现有 `runSkill`、`routeSkill`。

### 5.3 `streamSkill` 实现
- 用 `streamText({ model, system: skill.body, prompt: input, tools, stopWhen: stepCountIs(6), abortSignal: signal, providerOptions })`。
- 遍历 `result.fullStream`，按 `part.type` 产出事件（delta 合并交给客户端渲染，服务端逐 part 发）：
  - `reasoning-delta` → `{type:'reasoning-delta', text}`
  - `text-delta` → `{type:'text-delta', text}`
  - `tool-call` → `{type:'tool-call', toolCallId, toolName, args}`
  - `tool-result` → `{type:'tool-result', toolCallId, result}`
  - `error` → throw（路由层转 `error` 事件）
- 末尾：`text` skill 直接 `{type:'result', result:{type:'text', skill, text: 累加文本}}`；`reply`/`stats` 复用现有 `generateJson`（喂 `fullStream` 结束后的 `response.messages` + 显式 shape）产出结构化 `result`。

### 5.4 路由 `POST /api/run/stream`
- `streamSSE(c, async (stream) => {...})`；`const ac = new AbortController(); stream.onAbort(() => ac.abort())`。
- loadSkills（try 外，FS 错→500）；try 内：显式 skill 或 `routeSkill` → 发 `skill-selected`；`buildToolRegistry`+`pickTools`；`for await (const ev of ai.streamSkill(...ac.signal))` 逐个 `stream.writeSSE({event: ev.type, data: JSON.stringify(ev)})`；结束发 `done`。
- catch：非 abort 错误发 `error` 事件（AI 失败带 `fallback:'manual'`）；abort 静默结束。

## 6. 客户端 + CLI（`packages/cli`）

### 6.1 `client.ts`
```ts
runSkillStream(input, skill, onEvent: (e: RunStreamEvent) => void, signal): Promise<RunResponse>
```
- fetch `POST /api/run/stream` → `response.body.pipeThrough(new TextDecoderStream()).pipeThrough(new EventSourceParserStream())`。
- 逐条 `RunStreamEventSchema.parse(JSON.parse(data))` → `onEvent(ev)`。
- `result` 事件 → resolve 其 `result`；`error` 事件 → throw（`fallback:'manual'` 抛 `ManualFallbackError`）。
- 依赖 `eventsource-parser`。

### 6.2 `repl.tsx`
- `submitRaw` 改用 `runSkillStream`；维护「进度区」state：累加 reasoning/text 增量、tool-call 行（`▸ template_fill …` → 收到 result 标记完成），实时渲染（打字机）。
- 收到 `result` → 清进度区、`setResult`（现有 reply/stats/text 面板渲染）。
- `error`/`ManualFallbackError` → 复用现有错误/手动降级流程。
- 取消：`abortRef = useRef<AbortController>()`；生成中按 `Esc` → `abortRef.current?.abort()`，状态置「已取消」，清进度。
- 现有编辑（Ctrl+E）/确认（Ctrl+Y）/手动选模板流程不变。
- 新增一个轻量 `renderers/progress.tsx` 渲染进度区（reasoning 灰色、tool-call 带边框、text 正文）。

## 7. 测试

- `/api/run` 现有 34 测试**不动**。
- 新增 `/api/run/stream` 端到端测试（`tests/app.test.ts`）：注入 fake `AiPort.streamSkill`（`async *` yield `skill-selected` + `tool-call` + `tool-result` + `result`），`app.request('/api/run/stream', {method:'POST',...})`，读取 SSE 响应 body 文本，断言包含各事件类型与最终 `result`。真实 LLM 仍 mock（fake AiPort）。
- `runSkill`/`generateText` 内部 AI 调用不测（策略不变）。

## 8. 改动文件清单

| 文件 | 改动 |
|---|---|
| `packages/shared/src/schemas.ts` | + `RunStreamEventSchema` |
| `packages/shared/src/types.ts` | + `RunStreamEvent` |
| `packages/shared/src/index.ts` | 导出（若非 `export *` 需补） |
| `packages/server/package.json` | - `@ai-sdk/openai-compatible`，+ `@ai-sdk/deepseek` |
| `packages/server/src/services/ai.ts` | `resolveModel` 改 deepseek + thinking；+ `streamSkill`；`runSkill` 换 model |
| `packages/server/src/agent/ai-port.ts` | `AiPort` + `streamSkill` |
| `packages/server/src/app.ts` | + `POST /api/run/stream`（streamSSE + abort） |
| `packages/server/src/config.ts` | `DEFAULT_CONFIG` 去掉 openai 条目 |
| `packages/server/tests/app.test.ts` | + stream 端到端测试；fake AiPort 补 `streamSkill` |
| `packages/cli/package.json` | + `eventsource-parser` |
| `packages/cli/src/client.ts` | + `runSkillStream` |
| `packages/cli/src/repl.tsx` | 进度区 + 取消 + 改用流式 |
| `packages/cli/src/renderers/progress.tsx` | 新增进度渲染 |
| `.env.example` / `docs` | 标注 OPENAI_API_KEY 不再使用；更新 §9 note |

## 9. 风险与验证

- **reasoning + tools 并存**：deepseek-chat thinking 模式理论上支持，实现时用真实 key `POST /api/run/stream` 实测：确认能收到 `reasoning-delta` 且 `tool-call`（template_fill）正常、`result` 正确。若不兼容 → reply skill 关 thinking（保工具、不流 reasoning），其它 skill 可留 reasoning。
- **SSE + OpenTUI 渲染**：进度区高频更新需注意重渲染；用增量 state + 合并。
- **取消竞态**：abort 后忽略迟到事件（用 requestId/标志位，镜像 baocode `isActiveRequest`）。
