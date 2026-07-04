# 用户消息卡片（仿 baocode UserMessage）— 设计（spec）

> 日期：2026-07-04
> 类型：CLI（`packages/cli`）UI 小优化，server 端零改动
> 关联：`docs/2026-07-04-auto-email-ui-design.md`、参考 baocode `components/messages/user-message.tsx`

## 1. 目标

把 REPL 里用户输入的回显从一行 DIM `> {截断80字符}` 换成 baocode 风格的 **UserMessage 卡片**：左侧主色竖条 + surface 背景。粘贴的整封邮件按**前 6 行**预览（另对超长单行兜底截到 ~300 字符），超出加 `…`。

范围：仅 `packages/cli`。server/client/slash 不动。

## 2. 决策

| 议题 | 决定 |
|---|---|
| 样式 | baocode UserMessage：`border={['left']}` 主色 + `backgroundColor={colors.surface}` 卡片，居中，paddingX=2/paddingY=1 |
| 边框色 | `colors.primary`（hynote 无 Build/Plan mode，去掉 baocode 的 mode 分支） |
| 前缀 | 去掉 `> `（卡片+竖条已表明是用户输入） |
| 显示量 | 预览前 6 行；结果 >300 字符再兜底截断；截断则加 `…` |
| 组件位置 | `components/user-message.tsx`（扁平，与现有 `bot-message.tsx` 一致，不建 `messages/` 子目录） |

## 3. 组件设计

### 3.1 `packages/cli/src/components/user-message.tsx`（新）

```tsx
import { useTheme } from '../providers/theme';

const MAX_LINES = 6;
const MAX_CHARS = 300;

// 用户输入预览：取前 MAX_LINES 行；若行数超出或结果超过 MAX_CHARS 则截断并加省略号。
export function previewInput(raw: string): string {
  const text = raw.replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  let truncated = lines.length > MAX_LINES;
  let out = lines.slice(0, MAX_LINES).join('\n');
  if (out.length > MAX_CHARS) {
    out = out.slice(0, MAX_CHARS);
    truncated = true;
  }
  return truncated ? `${out.trimEnd()}…` : out;
}

export function UserMessage({ message }: { message: string }) {
  const { colors } = useTheme();
  return (
    <box width="100%" alignItems="center">
      <box border={['left']} borderColor={colors.primary} width="100%">
        <box
          justifyContent="center"
          paddingX={2}
          paddingY={1}
          backgroundColor={colors.surface}
          width="100%"
        >
          <text>{previewInput(message)}</text>
        </box>
      </box>
    </box>
  );
}
```

### 3.2 `packages/cli/src/screens/repl.tsx`
- `turn.input` 改存**完整** raw：把两处 `truncate(raw)`（runTurn 的 stats 短路分支、reply 分支）改成 `raw`（`Turn.input` 语义变为完整输入；显示截断交给 UserMessage）。手动模板分支的 `input: \`手动模板：${next.template}\`` 保持不变（短标签，预览无副作用）。
- 渲染：把
  ```tsx
  {turn.input && (
    <box paddingX={3}>
      <text attributes={TextAttributes.DIM}>{`> ${turn.input}`}</text>
    </box>
  )}
  ```
  换成
  ```tsx
  {turn.input && <UserMessage message={turn.input} />}
  ```
- 删除不再使用的 `truncate` helper（仅被上面两处引用）。若删除后 `TextAttributes` 仍被其它地方用到则保留其 import，否则一并清理。
- 新增 import：`import { UserMessage } from '../components/user-message';`。

## 4. 测试 / 验证

- 单测 `packages/cli/tests/user-message.test.ts`：`previewInput`——
  - ≤6 行且短 → 原样返回；
  - >6 行 → 只留前 6 行 + `…`；
  - 无换行超长（>300 字符）→ 截到 300 + `…`。
- 卡片样式（竖条/背景/内边距）靠 `bunx tsc` + `bun build` + 真实终端观察。
- 现有 40+ 单测不受影响。

## 5. 改动文件

| 文件 | 改动 |
|---|---|
| `packages/cli/src/components/user-message.tsx` | 新增 `UserMessage` + `previewInput` |
| `packages/cli/src/screens/repl.tsx` | `turn.input` 存完整 raw（去 2 处 truncate）；渲染改用 `<UserMessage>`；删除 `truncate` helper |
| `packages/cli/tests/user-message.test.ts` | 新增 `previewInput` 单测 |

## 6. 风险

- opentui `<text>` 在卡片盒子里按宽度自动换行——预览按「逻辑行」截断，超长单行由 300 字符兜底，避免卡片过高/过宽。
- 若 `truncate` 删除后 `screens/repl.tsx` 其它地方还引用它/`TextAttributes`，需一并处理引用（实现时 tsc 兜底）。
