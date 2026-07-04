# 内容驱动的确认门控（普通文字不弹确认）— 设计（spec）

> 日期：2026-07-04
> 类型：reply 技能提示词微调 + CLI 内容门控（一个纯函数 + 单测）
> 关联：`docs/2026-07-04-input-confirm-optimization-design.md`

## 1. 目标

用户发普通文字（不是邮件）时不再弹「确认并复制/编辑/取消」选项。做法：**渲染由返回内容决定**——reply 结果里有非空 `template` 才当真实回复（渲染回复卡片 + 确认选项）；否则把 `reply` 文本当普通消息渲染，不弹确认。reply 技能在遇到非邮件输入时返回空 `template` + 一句普通回应。

范围：`reply/SKILL.md` 提示词 + `packages/cli`（新纯函数 + repl 门控）。不加 chat 技能、不改路由、不改 seeding。

## 2. 决策

| 议题 | 决定 |
|---|---|
| 门控依据 | reply 结果的 `template` 非空 → 需要确认；空 → 不需要（当普通文字渲染） |
| 非邮件时 reply 技能 | 不调模板工具；`template=''`、`reply=` 一句普通回应、`metadata={}` |
| schema | 不改（`template` 本就是 `z.string()`，空串合法） |
| 抽象 | 抽 `shouldConfirm(res)` 纯函数 + 单测（便于扩展/回归） |
| 路由 / seeding / chat | 都不动 |

## 3. 设计

### 3.1 reply 技能提示词（`packages/server/src/assets/skills/reply/SKILL.md` 正文）
在 Steps 前加一条判断（保持 `output: reply` 与工具不变）：

> 0. 先判断输入是否是一封**需要回复的邮件**。如果**不是**（只是普通文字/问候/闲聊/无关内容），**不要**调用模板工具；直接返回 `template` 为空字符串 `""`、`reply` 为一句简短友好的普通回应、`metadata` 为 `{}`。只有当输入确实是邮件时，才执行下面的选模板/填充/提取步骤。

### 3.2 CLI 纯函数 `packages/cli/src/should-confirm.ts`（新）
```ts
import type { RunResponse } from '@auto-email/shared';

// 是否需要「确认并复制」流程：仅当结果是一封真实回复（reply 且 template 非空）。
export function shouldConfirm(res: RunResponse): boolean {
  return res.type === 'reply' && res.template.trim().length > 0;
}
```

### 3.3 repl 门控（`packages/cli/src/screens/repl.tsx`）
- import：`import { shouldConfirm } from '../should-confirm';`
- reply 分支改为：始终存 `turn.reply`（文字照常渲染），但仅在 `shouldConfirm(res)` 时 `setPending(...)` + `setConfirmIndex(0)`：
```tsx
if (res.type === 'reply') {
  updateTurn(id, (t) => ({ ...t, streaming: false, reply: res }));
  if (shouldConfirm(res)) {
    setPending({ turnId: id, reply: res, emailContent: text || raw });
    setConfirmIndex(0);
  }
}
```
- 其余不变：`turn.reply` 存在时其 `reply` 文本作为 text part 渲染；`ReplyMeta`（pills）与 ConfirmMenu 都只在 `pending` 时出现，故空 template 时自然无确认、无 pills。

## 4. 效果

- 普通文字 → reply 技能返回空 template + 普通回应 → 当文字渲染、**不弹确认**。
- 真实邮件 → 有 template → 回复卡片 + 确认选项。
- `/stats` → panels → 统计面板（不受影响）。
- `/reply` 显式：若内容不是邮件，同样返回空 template → 不弹确认（一致：无法回复非邮件）。

## 5. 测试 / 验证

- 单测 `packages/cli/tests/should-confirm.test.ts`：
  - `{type:'reply', template:'kol-media-support', …}` → true；
  - `{type:'reply', template:'', …}` → false；
  - `{type:'reply', template:'   ', …}` → false（trim）；
  - `{type:'stats', …}` → false；`{type:'text', …}` → false。
- reply 技能行为（AI）不单测；真实终端验证：普通文字不弹确认、邮件弹确认。
- 现有 48 单测不受影响。

## 6. 改动文件

| 文件 | 改动 |
|---|---|
| `packages/server/src/assets/skills/reply/SKILL.md` | 正文加「非邮件 → 空 template + 普通回应」判断 |
| `packages/cli/src/should-confirm.ts` | 新增 `shouldConfirm` 纯函数 |
| `packages/cli/src/screens/repl.tsx` | reply 分支用 `shouldConfirm` 门控 `setPending` |
| `packages/cli/tests/should-confirm.test.ts` | 新增单测 |

## 7. 风险

- 提示词是 AI 行为引导，模型可能偶尔仍对边界输入选模板——可接受，靠提示收敛；真实 key 实测。
- 已播种到 `~/.bao-auto-mail/skills/reply/SKILL.md` 的旧版本不会自动更新（seeding 只在缺失时补）。**实现时需同步更新用户目录那份**（或提示用户删掉重新播种）；spec 实现步骤里包含「更新 `~/.bao-auto-mail/skills/reply/SKILL.md`」。
