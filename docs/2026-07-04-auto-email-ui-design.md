# Auto Email — CLI UI 重构设计（spec，仿 baocode）

> 日期：2026-07-04
> 类型：CLI（`packages/cli`）UI 重构，server 端零改动
> 参考：baocode `packages/cli`（真实源码 + 用户提供的 `bot-message.tsx`）、`docs/2026-07-03-auto-email-email-agent-design.md`

## 1. 目标与范围

把 Auto Email 的终端 UI **完全对齐 baocode 的外观与渲染标准**：主题系统、provider 分层、ascii-font 头部、parts 分组的消息渲染（Thinking/工具/正文）、左竖条 InputBar、底部状态行。**server 端不改**（沿用 `/api/run/stream` 等）。品牌显示从 "auto-email" 改为 **"Auto Email"**。

**范围**：仅 `packages/cli`。现有 `client.ts` / `slash.ts` / server 逻辑不动。

## 2. 决策汇总（来自 Q&A）

| 议题 | 决定 |
|---|---|
| 采纳深度 | 仿外观 + 保留 toast / dialog / keyboard-layer / react-router 基础设施 |
| 品牌名 | UI 显示 "Auto Email"（`<ascii-font>` "Auto"橙 + "Email"默认色） |
| InputBar | 去掉 @文件提及；保留左竖条外观 + textarea（多行/提交键）+ 命令菜单（打 `/` 弹 skill 列表） |
| 路由 | react-router 骨架（RootLayout + Outlet）+ **单主屏**（Repl） |
| dialog | 主题切换 + 手动选模板（可搜索列表）走 dialog |
| toast | 确认（复制+存库）成功用 toast 提示 |
| 状态栏 | `deepseek › deepseek-chat`（provider › model）；右侧 `/ 命令 · Ctrl+T 主题` |
| 主题 | 多套配色（Nightfox/Catppuccin/Dracula/Monokai）+ 切换 + 持久化到 `~/.bao-auto-mail/preferences.json` |
| **reply 结果呈现** | **纯 baocode 风**：回复正文 = 消息的 markdown text part；统计标签 = 一行小 pill；确认提示 = DIM 行。**无边框结果面板** |

## 3. 渲染标准 — BotMessage（精确按 baocode `bot-message.tsx`）

消息由 `parts` 数组驱动，`groupConsecutiveParts` 合并连续同类型 part。三类 part：

- **reasoning**：`<box border={['left']} borderColor={colors.thinkingBorder} customBorderChars={{...EmptyBorder, vertical:'│'}} paddingX={2}>` 内 `<text attributes={DIM}><em fg={colors.thinking}>Thinking:</em> {text}</text>`
- **tool**：同款左竖条框，`<em fg={colors.info}>{formatToolName(name)}:</em> {args}`，`status==='calling'` 追加 ` …`。`formatToolName`：`template_fill` → `Template Fill`（下划线/驼峰转空格 + 首字母大写）
- **text**：`<box paddingX={3}>` 内 `<markdown syntaxStyle={syntaxStyle} content={text} streaming={streaming} />`；`SyntaxStyle.create()` 注册 `markup.strong`(bold)/`markup.link`(info 色)/`markup.raw`(success 色)
- **底部元数据行**：`◉`（`colors.primary`）+ `provider › model`（auto-email 无 Build/Plan mode，用 provider/model 替代 baocode 的 mode）+ streaming 时追加 `› streaming…`

**流事件 → parts 适配器** `eventsToParts(events)`：`reasoning-delta`/`text-delta` 累加进末尾同类型 part；`tool-call` push `{type:'tool', id, name, status:'calling'}`；`tool-result` 按 `toolCallId` 把对应 tool 置 `done`。（替代当前 `ProgressView` + `ProgressState`。）

## 4. 主题系统

- `theme.ts`：`THEMES: Theme[]`（搬 baocode 四套配色）+ `ThemeColors` 类型 + `DEFAULT_THEME`。
- `providers/theme/index.tsx`：`ThemeProvider` + `useTheme()`（`colors/currentTheme/setTheme/allThemes`），初始主题读 `~/.bao-auto-mail/preferences.json`，`setTheme` 持久化。
- `layouts/theme-root.tsx`：用 `colors.background` 铺底的根 box。

## 5. Providers 与布局架构

`layouts/root-layout.tsx`：
```
ThemeProvider > KeyboardLayerProvider > ToastProvider > DialogProvider > ThemeRoot > <Outlet/>
```
（对齐 baocode，去掉 auto-email 用不到的 PromptConfigProvider。）
`index.tsx`：`createCliRenderer` + `createRoot` + `createMemoryRouter([{ path:'/', element:<RootLayout/>, children:[{ index:true, element:<Repl/> }] }])`。

`providers/keyboard-layer`、`providers/toast`、`providers/dialog`：搬 baocode 对应实现，改命名空间（`@baocode`→`@auto-email`），去掉领域耦合（MODE 等）。

## 6. 组件清单（`packages/cli/src`）

```
index.tsx                createCliRenderer + createRoot + router
theme.ts                 THEMES + ThemeColors + DEFAULT_THEME        [草稿已写]
layouts/
  root-layout.tsx        provider 分层 + Outlet
  theme-root.tsx         背景底板
providers/
  theme/index.tsx        ThemeProvider/useTheme（持久化）             [草稿已写]
  keyboard-layer/index.tsx  搬 baocode
  toast/index.tsx           搬 baocode
  dialog/index.tsx          搬 baocode
screens/
  repl.tsx               主屏：SessionShell 布局 + 现有领域逻辑
components/
  header.tsx             `<ascii-font font="tiny" text="Auto" color="orange"/>` + `<ascii-font font="tiny" text="Email"/>`（两段拼，同 baocode Bao+Code）   [草稿已写]
  status-bar.tsx         deepseek › deepseek-chat                    [草稿已写]
  session-shell.tsx      头部 + sticky scrollbox + InputBar + 底部状态行(spinner+esc+提示)
  input-bar.tsx          左竖条 + textarea + 命令菜单（去 @提及）
  command-menu/          打 / 弹 skill 列表（数据来自 client.listSkills）
  spinner.tsx            opentui-spinner <spinner name="aesthetic">
  border.tsx             EmptyBorder / SplitBorderChars
  bot-message.tsx        parts 分组渲染（§3 标准）+ eventsToParts    [草稿已写]
  dialogs/
    theme-dialog.tsx     主题切换（可搜索列表）
    template-dialog.tsx  手动选模板（可搜索列表）
renderers/
  reply.tsx    reply 呈现：正文交给 BotMessage 的 markdown text part；本组件只渲染「一行 pill 标签 + DIM 确认提示」（无边框面板）
  stats.tsx    统计面板，主题化的横向 bar（baocode 无对应，自有但主题色）
client.ts / slash.ts     不变
```

## 7. 领域流程映射

- 提交 `/reply`/纯文字 → `runSkillStream`（现有）；`onEvent` 累进 `events[]` → `eventsToParts` → `<BotMessage parts streaming>` 实时渲染（Thinking 竖条 / 工具行 / markdown 正文）。
- `result` 事件（**纯 baocode 风，无边框面板**）：`reply` → 回复正文作为 BotMessage 的 **markdown text part**，其下 `renderers/reply.tsx` 只渲染「一行 pill 标签（platform/email_name…）+ DIM 确认提示（Ctrl+E/Y/N）」；`stats` → `renderers/stats.tsx` 主题化横向 bar；`text` → BotMessage 的 text part。
- 确认 `Ctrl+Y` → 复制 + `saveReply` → **toast** "已复制并保存"（替代状态行文字）。
- AI 降级（`ManualFallbackError`）/ 手动选模板 → **dialog**（可搜索模板列表）→ 选中载入编辑缓冲。
- `Ctrl+T` → 主题切换 **dialog**。
- streaming 中 `Esc` → 取消（现有 AbortController）；底部显示 spinner + "esc to interrupt"。
- 编辑（`Ctrl+E`）/取消（`Ctrl+N`）流程保留。

## 8. 依赖

新增：`opentui-spinner`、`react-router`。已有：`@opentui/core`/`@opentui/react`（含 SyntaxStyle/Markdown/ASCIIFont）、`clipboardy`、`eventsource-parser`、`react`。

## 9. 已验证的 @opentui API（v0.2.16，降风险）

- `SyntaxStyle`（`@opentui/core`）：`SyntaxStyle.create()` + `registerStyle(name, {fg,bold,...})`。✓
- `<markdown syntaxStyle content streaming />`（`Markdown` renderable）。✓
- `<ascii-font font="tiny" text color />`（`ASCIIFont` renderable）。✓
- `<box border={['left']} customBorderChars={{...}} borderColor />`、`<text attributes={TextAttributes.DIM}>`、`<em fg>`、`<spinner>`（opentui-spinner/react）。✓
- `createCliRenderer`（`@opentui/core`）+ `createRoot`（`@opentui/react`）引导；`react-router` `createMemoryRouter`/`RouterProvider`（baocode 同款）。

## 10. 测试 / 验证

- 现有 `slash` / `client` / `client-stream` 单测**不变**（40 个）。
- CLI 是 TUI，无新增自动化 UI 测试；验证 = `bunx tsc -p packages/cli/tsconfig.json --noEmit` 干净 + `bun build packages/cli/src/index.tsx` 成功 + 真实 `auto-email` 跑通（流式渲染、主题切换、toast、dialog 选模板）。

## 11. 风险

- `<markdown>` 流式渲染在高频 delta 下的性能/闪烁——用 parts 累加 + `streaming` 标志（baocode 已验证可行）。
- `opentui-spinner` 版本与 `@opentui` 0.2.16 兼容性——baocode 用 `opentui-spinner@^0.0.6`，实现时对齐并 tsc 验证。
- 命令菜单 / 键盘分层（keyboard-layer）与 textarea 焦点的交互——搬 baocode 实现，去 mentions 后简化，实测焦点/Esc 行为。
- baocode 的 provider（toast/dialog/keyboard-layer）可能依赖其它 baocode 内部工具——搬运时逐个补齐依赖或最小化实现。
