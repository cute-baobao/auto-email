# User Message Card — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the REPL user-input echo as a baocode-style `UserMessage` card (left primary accent + surface background), previewing the first 6 lines (≤300 chars) of the input instead of the current DIM `> {80-char}` line.

**Architecture:** New `packages/cli/src/components/user-message.tsx` (`UserMessage` + pure `previewInput`); `repl.tsx` stores the full raw input on the turn and renders `<UserMessage>`; drop the old `truncate` helper.

**Tech Stack:** `@opentui`, React, TypeScript, Vitest. CLI-only. Server/client/slash untouched. Existing tests stay green.

**Spec:** `docs/2026-07-04-user-message-card-design.md`. Run from repo root.

---

## Task 1: `user-message.tsx` (previewInput TDD + component)

**Files:** Create `packages/cli/src/components/user-message.tsx`, `packages/cli/tests/user-message.test.ts`

- [ ] **Step 1: Write the failing test** `packages/cli/tests/user-message.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { previewInput } from '../src/components/user-message';

describe('previewInput', () => {
  it('returns short single-line input unchanged', () => {
    expect(previewInput('Hi Joanna')).toBe('Hi Joanna');
  });
  it('keeps first 6 lines and appends … when longer', () => {
    const input = Array.from({ length: 10 }, (_, i) => `line${i + 1}`).join('\n');
    const out = previewInput(input);
    expect(out.startsWith('line1\nline2\nline3\nline4\nline5\nline6')).toBe(true);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toContain('line7');
  });
  it('caps a long single line at 300 chars + …', () => {
    const input = 'a'.repeat(500);
    const out = previewInput(input);
    expect(out.length).toBe(301); // 300 chars + …
    expect(out.endsWith('…')).toBe(true);
  });
  it('normalizes CRLF', () => {
    expect(previewInput('a\r\nb')).toBe('a\nb');
  });
});
```

- [ ] **Step 2: Run it, verify FAIL**

Run: `bun run test packages/cli/tests/user-message.test.ts`
Expected: FAIL — cannot find `previewInput` / module.

- [ ] **Step 3: Create `packages/cli/src/components/user-message.tsx`**:

```tsx
import { useTheme } from '../providers/theme';

const MAX_LINES = 6;
const MAX_CHARS = 300;

// User-input preview: keep the first MAX_LINES lines; if there were more lines
// or the result exceeds MAX_CHARS, truncate and append an ellipsis.
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

- [ ] **Step 4: Run it, verify PASS**

Run: `bun run test packages/cli/tests/user-message.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `bunx tsc -p packages/cli/tsconfig.json --noEmit` → exit 0.

```bash
git add packages/cli/src/components/user-message.tsx packages/cli/tests/user-message.test.ts
git commit -m "feat(cli): UserMessage card + previewInput"
```

---

## Task 2: Wire `UserMessage` into the Repl screen

**Files:** Modify `packages/cli/src/screens/repl.tsx`

- [ ] **Step 1: Add the import** near the other component imports:

```tsx
import { UserMessage } from '../components/user-message';
```

- [ ] **Step 2: Store the full raw input on the turn.** In `runTurn`, the two `addTurn({ ..., input: truncate(raw), ... })` calls (the `/stats` short-circuit branch — both its success and error `addTurn`, and the streaming branch) change `input: truncate(raw)` → `input: raw`. (The manual-template branch's `input: \`手动模板：${next.template}\`` stays as-is.)

- [ ] **Step 3: Replace the input echo render.** Change:

```tsx
            {turn.input && (
              <box paddingX={3}>
                <text attributes={TextAttributes.DIM}>{`> ${turn.input}`}</text>
              </box>
            )}
```

to:

```tsx
            {turn.input && <UserMessage message={turn.input} />}
```

- [ ] **Step 4: Delete the now-unused `truncate` helper** (the `function truncate(text: string): string { … }` near the top of the file). Leave the `TextAttributes` import in place — it is still used by `EditBar`'s DIM hint. (If `bunx tsc` reports `truncate` still referenced, fix that reference; if it reports `TextAttributes` unused, only then remove it.)

- [ ] **Step 5: Typecheck + bundle + tests**

Run: `bunx tsc -p packages/cli/tsconfig.json --noEmit` (exit 0); `bun build packages/cli/src/index.tsx --target bun --outdir /tmp/ae-um` (success); `bun run test` (all pass, includes the 4 new previewInput tests).

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/screens/repl.tsx
git commit -m "feat(cli): render user input as a UserMessage card"
```

---

## Task 3: Verify

- [ ] **Step 1: Final gate** — `bun run test` (prior + 4 previewInput = 48) and `bunx tsc -p packages/cli/tsconfig.json --noEmit` (exit 0) and `bun build packages/cli/src/index.tsx --target bun --outdir /tmp/ae-um` (success).
- [ ] **Step 2 (user, needs TTY):** Live — `/reply` + paste a long email: the input shows as a surface card with a left primary accent bar, previewed to 6 lines + `…`; short inputs show fully; theme switch recolors the accent.

---

## Self-Review Notes (author checklist — applied)

- **Spec coverage:** UserMessage card (Task 1 component: `border=['left']` primary + surface bg, no `>` prefix, no mode); previewInput 6-line/300-char/`…` (Task 1 `previewInput` + tests); repl stores full raw + renders `<UserMessage>` + drops `truncate` (Task 2). Server/client/slash untouched.
- **Placeholder scan:** none — full code per step; Task 2 Step 4's conditional (`TextAttributes` kept unless tsc flags it) is a concrete verification, not deferred work.
- **Type consistency:** `previewInput(raw: string): string` and `UserMessage({ message: string })` match the test import and the repl call site `<UserMessage message={turn.input} />`. `turn.input` remains `string | undefined` (guarded by `turn.input &&`).
