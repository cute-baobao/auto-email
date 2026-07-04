# CLI 两处优化：内容门控确认 + history 自动滚动 — 设计（spec）

> 日期：2026-07-04
> 类型：`packages/cli` UI + reply 技能提示词微调
> 关联：`docs/2026-07-04-content-gated-confirm-design.md`（A 部分详版）、`docs/2026-07-04-auto-email-ui-design.md`

一份 spec 覆盖两处小优化，一起实现。

---

## A. 内容门控确认（普通文字不弹确认）

### A.1 目标
用户发普通文字（非邮件）时不再弹「确认并复制/编辑/取消」。渲染由返回内容决定：reply 结果里 `template` 非空才当真实回复（回复卡片 + 确认）；否则把 `reply` 文本当普通消息渲染、不弹确认。reply 技能遇到非邮件输入时返回空 `template` + 一句普通回应。

### A.2 reply 技能提示词（`packages/server/src/assets/skills/reply/SKILL.md`）
frontmatter description 收紧为「仅当输入是一封真实的待回复邮件时」；正文在选模板步骤前加：

> First decide whether the input is an actual email that needs a reply. If it is NOT an email (just plain text, a greeting, small talk, or unrelated content): do NOT call any template tool — return an empty string `""` as `template`, a short friendly plain-text answer as `reply`, and `{}` as `metadata`. Only when the input really is an email, do the steps below.

**同步**：改完 bundled asset 后，把它拷到已播种的 `~/.bao-auto-mail/skills/reply/SKILL.md`（seeding 只在缺失时补，旧安装不会自动更新）。

### A.3 CLI 纯函数 `packages/cli/src/should-confirm.ts`（新）
```ts
import type { RunResponse } from '@hynote/shared';

// 仅当结果是一封真实回复（reply 且 template 非空）才进确认流程。
export function shouldConfirm(res: RunResponse): boolean {
  return res.type === 'reply' && res.template.trim().length > 0;
}
```

### A.4 repl 门控（`packages/cli/src/screens/repl.tsx`）
reply 分支：始终存 `turn.reply`（文字照常渲染），仅 `shouldConfirm(res)` 时 `setPending(...)` + `setConfirmIndex(0)`：
```tsx
if (res.type === 'reply') {
  updateTurn(id, (t) => ({ ...t, streaming: false, reply: res }));
  if (shouldConfirm(res)) {
    setPending({ turnId: id, reply: res, emailContent: text || raw });
    setConfirmIndex(0);
  }
}
```

### A.5 A 部分测试
`packages/cli/tests/should-confirm.test.ts`：reply+非空 template→true；空/空白 template→false；stats→false；text→false。

---

## B. history 自动滚动

### B.1 目标
新消息 / 流式每来一段，消息区自动滚到底。当前 `stickyScroll stickyStart="bottom"` 在此环境未生效，改用**显式滚动**（保留 sticky 兜底）。

### B.2 `packages/cli/src/components/session-shell.tsx`
- import `useEffect`, `useRef`（react）+ `type ScrollBoxRenderable`（`@opentui/core`）。
- `<scrollbox>` 加 `ref={scrollRef}`（保留 `stickyScroll stickyStart="bottom"`）。
- 新增可选 prop `scrollKey?: number`。
- 效果：
```tsx
const scrollRef = useRef<ScrollBoxRenderable>(null);
useEffect(() => {
  const sb = scrollRef.current;
  if (sb) sb.scrollTop = sb.scrollHeight;
}, [scrollKey]);
```

### B.3 `packages/cli/src/screens/repl.tsx`
- 加 `const [scrollKey, setScrollKey] = useState(0);`。
- 在 `addTurn` 和 `updateTurn` 里各加一句 `setScrollKey((k) => k + 1);`（新回合 + 每个流式事件都触发滚动）。
- `<SessionShell … scrollKey={scrollKey}>`。

### B.4 B 部分测试
纯 TUI 布局行为，无自动化测试；靠 tsc + bundle + 真实终端验证（长对话/流式时自动滚到底）。

---

## 测试 / 验证（合计）

- `bun run test`：现有 48 + A 部分 4 个 `shouldConfirm` = 52 通过。
- `bunx tsc -p packages/cli/tsconfig.json --noEmit` 干净；`bun build packages/cli/src/index.tsx` 成功。
- 真实终端：普通文字不弹确认、邮件弹确认；消息区自动滚到底。

## 改动文件

| 文件 | 改动 |
|---|---|
| `packages/server/src/assets/skills/reply/SKILL.md` | 非邮件→空 template + 普通回应（+ 同步 `~/.bao-auto-mail/skills/reply/SKILL.md`） |
| `packages/cli/src/should-confirm.ts` | 新增 `shouldConfirm` |
| `packages/cli/tests/should-confirm.test.ts` | 新增单测 |
| `packages/cli/src/components/session-shell.tsx` | scrollRef + `scrollKey` prop + 滚到底 effect |
| `packages/cli/src/screens/repl.tsx` | `shouldConfirm` 门控；`scrollKey` state + `addTurn`/`updateTurn` bump + 传给 SessionShell |

## 风险

- A：提示词是 AI 行为引导，边界输入偶尔仍可能选模板——可接受，真实 key 实测。
- B：`scrollTop = scrollHeight` 依赖 effect 后 `scrollHeight` 已反映新内容；若个别情况下未滚到底，可改用 `scrollTo(sb.scrollHeight)`。TUI 行为需真实终端确认。
