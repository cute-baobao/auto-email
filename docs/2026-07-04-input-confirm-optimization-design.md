# Input 最大高度 + 确认选项器 — 设计（spec）

> 日期：2026-07-04
> 类型：CLI（`packages/cli`）UI 小优化，server 端零改动
> 关联：`docs/2026-07-04-auto-email-ui-design.md`

## 1. 目标

两点优化：
1. **Input 最大高度**：输入 textarea 封顶 8 行，超出内部滚动，粘长邮件不再撑高输入区。
2. **确认改成输入区的竖向选项器**：reply 待确认时，底部输入区从 textarea 换成竖向选项菜单（确认并复制 / 编辑 / 取消，↑/↓ + Enter），并保留 Ctrl+Y/E/N 快捷键。原来消息下方的 DIM 快捷键提示行移除。

范围：仅 `packages/cli`。`client.ts`/`slash.ts`/server/shared 不动。

## 2. 决策

| 议题 | 决定 |
|---|---|
| 最大高度 | textarea `maxHeight={8}`（Yoga 布局属性，EditBufferRenderable 超出内部滚动） |
| 选项器形态 | 竖向列表（像命令菜单）：确认并复制 / 编辑 / 取消 |
| 导航 | ↑/↓ 移动选中 + Enter 执行 |
| 快捷键 | 保留 Ctrl+Y（确认）/ Ctrl+E（编辑）/ Ctrl+N（取消） |
| 位置 | 坐在输入区（替换 textarea）；reply 待确认时显示 |
| pill 标签 | 保留（模板/来件/metadata 仍在消息下方），只移除 DIM 快捷键提示行 |

## 3. 组件设计

### 3.1 Input 最大高度
- `components/input-bar.tsx` 的 `<textarea>` 加 `maxHeight={8}`。
- `screens/repl.tsx` 内 `EditBar` 的 `<textarea>` 加 `maxHeight={8}`。
- 行为：占位/单行时 1 行高，随内容增长到 8 行，超过后 textarea 内部滚动（光标可见），输入区总高受控。

### 3.2 ConfirmMenu（新，纯展示）
`components/confirm-menu.tsx`：
```tsx
export type ConfirmItem = { label: string; hint: string };
export const CONFIRM_ITEMS: ConfirmItem[] = [
  { label: '确认并复制', hint: 'Ctrl+Y' },
  { label: '编辑',       hint: 'Ctrl+E' },
  { label: '取消',       hint: 'Ctrl+N' },
];
export function ConfirmMenu({ selectedIndex }: { selectedIndex: number }) { … }
```
- 外壳与 InputBar 一致：`border={['left']}` + `customBorderChars` 竖条 `┃` + `colors.primary` + `colors.surface` 背景 + `paddingX={2} paddingY={1}`。
- 3 行，每行 `label`（左）+ `hint`（右，DIM）；选中行 `backgroundColor={colors.selection}`、文字 `fg="black"`（对比命令菜单一致）。
- 纯展示：不含键盘逻辑（选中态由 Repl 传入）。

### 3.3 SessionShell 加 `inputSlot`
`components/session-shell.tsx`：新增可选 `inputSlot?: React.ReactNode`。渲染底部输入区时：`inputSlot ?? <InputBar commands={commands} onSubmit={onSubmit} disabled={inputDisabled} />`。其余布局不变。

### 3.4 Repl 接线（`screens/repl.tsx`）
- 新增 `confirmIndex` state（0，pending 出现时重置为 0）。
- 输入区计算：
  - `mode === 'edit'` → `inputSlot = <EditBar …/>`（EditBar 从 scroll 子节点移到 inputSlot）。
  - 否则 `pending` 存在 → `inputSlot = <ConfirmMenu selectedIndex={confirmIndex} />`。
  - 否则 → 不传 inputSlot（SessionShell 默认渲染 `<InputBar>`）。
- `useKeyboard`（Base 层）当 `pending && mode==='normal'`：
  - `up` → `confirmIndex = max(0, i-1)`；`down` → `min(2, i+1)`。
  - `return`/`enter` → 执行 `confirmIndex` 对应动作：0=confirmReply()，1=进入编辑（同 Ctrl+E 逻辑），2=清 pending。
  - Ctrl+Y/E/N 维持现有直达逻辑。
- `pending` 置位时 `setConfirmIndex(0)`。
- InputBar 只在**无 inputSlot** 时渲染；edit/pending 时 inputSlot 接管，InputBar 不渲染，故当前用于隐藏 InputBar 的 `inputDisabled` 不再需要（edit 分支改为走 inputSlot，移除 `inputDisabled={mode==='edit'}` 传参）。

### 3.5 ReplyMeta（`renderers/reply.tsx`）
移除末行 `<text DIM>Ctrl+E 编辑 · Ctrl+Y 确认并复制 · Ctrl+N 取消</text>`；保留 pill 标签行。

## 4. 交互流程

- reply 流完 → `pending` 置位 + `confirmIndex=0` → 输入区显示 ConfirmMenu（选中「确认并复制」）。
- ↑/↓ 移动高亮；Enter 执行；或 Ctrl+Y/E/N 直达。
- 选「确认并复制」→ saveReply + 复制 + toast「已复制并保存」+ 清 pending → 输入区恢复 InputBar。
- 选「编辑」→ 进 edit 模式 → 输入区显示 EditBar（8 行封顶）→ 回车提交 → 回到 pending（ConfirmMenu）。
- 选「取消」→ 清 pending → 输入区恢复 InputBar。

## 5. 测试 / 验证

- 现有单测（slash/client/client-stream，40 个）不变。
- 无自动化 UI 测试；验证 = `bunx tsc -p packages/cli/tsconfig.json --noEmit` 干净 + `bun build packages/cli/src/index.tsx` 成功 + 真实终端跑：粘长邮件看 8 行封顶+内部滚动；reply 后输入区出现 ConfirmMenu，↑/↓/Enter 与 Ctrl 快捷键都能确认/编辑/取消。

## 6. 改动文件清单

| 文件 | 改动 |
|---|---|
| `components/input-bar.tsx` | textarea `maxHeight={8}` |
| `components/confirm-menu.tsx` | 新增 ConfirmMenu + CONFIRM_ITEMS |
| `components/session-shell.tsx` | 加 `inputSlot?` 属性 |
| `screens/repl.tsx` | EditBar textarea maxHeight；confirmIndex + ↑↓Enter；inputSlot 逻辑（edit/pending/默认）；EditBar 移入 inputSlot |
| `renderers/reply.tsx` | 移除 DIM 快捷键提示行 |

## 7. 风险

- `maxHeight` 在 textarea 上的内部滚动行为需实测（EditBufferRenderable 应支持光标跟随滚动）；若 textarea 不直接吃 maxHeight，则用外层 `<box maxHeight={8}>` 包裹。
- ConfirmMenu 出现时 textarea 不渲染 → Enter 不被 textarea 吞，交给 Repl useKeyboard；需确认 Base 层 Enter 正确投递（无 textarea 聚焦）。
