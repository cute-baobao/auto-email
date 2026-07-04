# Input Max-Height + Confirm Options Selector — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cap the input textarea at 8 rows (internal scroll), and replace the reply confirm hint with a vertical options selector (确认并复制 / 编辑 / 取消, ↑/↓+Enter) that sits in the input region while a reply is pending — Ctrl+Y/E/N still work.

**Architecture:** `SessionShell` gains an `inputSlot` prop; `Repl` renders `<ConfirmMenu>` (pending) or `<EditBar>` (edit) into that slot instead of the textarea. Textareas get `maxHeight={8}`. Server/client/tests untouched.

**Tech Stack:** `@opentui/core`/`@opentui/react` 0.2.16, React, TypeScript. Verify via tsc + `bun build` + live run (no automated UI tests).

**Spec:** `docs/2026-07-04-input-confirm-optimization-design.md`. Run from repo root. Existing 40 tests must stay green.

---

## Task 1: SessionShell `inputSlot` prop

**Files:** Modify `packages/cli/src/components/session-shell.tsx`

- [ ] **Step 1:** Add `inputSlot?: React.ReactNode;` to the `Props` type; add `inputSlot` to the destructured params.
- [ ] **Step 2:** Replace the input box body so `inputSlot` overrides the default InputBar:

```tsx
      <box flexShrink={0}>
        {inputSlot ?? (
          <InputBar onSubmit={onSubmit} disabled={inputDisabled} commands={commands} />
        )}
      </box>
```

- [ ] **Step 3:** `bunx tsc -p packages/cli/tsconfig.json --noEmit` → exit 0. Commit `feat(cli): SessionShell inputSlot`.

---

## Task 2: Input textarea max height

**Files:** Modify `packages/cli/src/components/input-bar.tsx`

- [ ] **Step 1:** On the `<textarea>` (currently lines ~148-157) add `maxHeight={8}`:

```tsx
          <textarea
            ref={textareaRef}
            focused={
              !disabled &&
              (isTopLayer(LayerName.Base) || isTopLayer(LayerName.Command))
            }
            onContentChange={handleTextareaContentChange}
            placeholder="Type a message..."
            keyBindings={TEXTAREA_KEY_BINDINGS}
            maxHeight={8}
          />
```

- [ ] **Step 2:** `bunx tsc` → exit 0. If `maxHeight` isn't accepted directly on `<textarea>`, wrap it in `<box maxHeight={8}>…</box>` instead (note the fallback in the commit). Commit `feat(cli): cap input textarea at 8 rows`.

---

## Task 3: ConfirmMenu component

**Files:** Create `packages/cli/src/components/confirm-menu.tsx`

- [ ] **Step 1:** Write the file:

```tsx
import { TextAttributes } from '@opentui/core';
import { EmptyBorder } from './border';
import { useTheme } from '../providers/theme';

export type ConfirmItem = { label: string; hint: string };

export const CONFIRM_ITEMS: ConfirmItem[] = [
  { label: '确认并复制', hint: 'Ctrl+Y' },
  { label: '编辑', hint: 'Ctrl+E' },
  { label: '取消', hint: 'Ctrl+N' },
];

export function ConfirmMenu({ selectedIndex }: { selectedIndex: number }) {
  const { colors } = useTheme();
  return (
    <box width="100%" alignItems="center">
      <box
        border={['left']}
        borderColor={colors.primary}
        customBorderChars={{ ...EmptyBorder, vertical: '┃', bottomLeft: '╹' }}
        width="100%"
      >
        <box
          paddingX={2}
          paddingY={1}
          backgroundColor={colors.surface}
          width="100%"
          flexDirection="column"
        >
          {CONFIRM_ITEMS.map((item, i) => {
            const selected = i === selectedIndex;
            return (
              <box
                key={item.label}
                flexDirection="row"
                justifyContent="space-between"
                paddingX={1}
                backgroundColor={selected ? colors.selection : undefined}
              >
                <text fg={selected ? 'black' : undefined}>{item.label}</text>
                <text
                  fg={selected ? 'black' : colors.dimSeparator}
                  attributes={selected ? 0 : TextAttributes.DIM}
                >
                  {item.hint}
                </text>
              </box>
            );
          })}
        </box>
      </box>
    </box>
  );
}
```

- [ ] **Step 2:** `bunx tsc` → exit 0. Commit `feat(cli): ConfirmMenu options selector`.

---

## Task 4: Drop the confirm hint line from ReplyMeta

**Files:** Modify `packages/cli/src/renderers/reply.tsx`

- [ ] **Step 1:** Remove the last `<text>` (the `Ctrl+E 编辑 · Ctrl+Y 确认并复制 · Ctrl+N 取消` DIM line). Resulting file:

```tsx
import { useTheme } from '../providers/theme';

export function ReplyMeta({ metadata }: { metadata: Record<string, string> }) {
  const { colors } = useTheme();
  const entries = Object.entries(metadata);
  if (entries.length === 0) return null;
  return (
    <box flexDirection="column" paddingX={3} gap={0}>
      <box flexDirection="row" gap={1}>
        {entries.map(([k, v]) => (
          <text key={k} fg={colors.selection}>{`${k}: ${v}`}</text>
        ))}
      </box>
    </box>
  );
}
```

- [ ] **Step 2:** `bunx tsc` → exit 0 (note: `TextAttributes` import now unused — remove it). Commit `feat(cli): drop confirm hint from ReplyMeta`.

---

## Task 5: Wire Repl — confirm selector + edit into inputSlot + EditBar max height

**Files:** Modify `packages/cli/src/screens/repl.tsx`

- [ ] **Step 1:** Import ConfirmMenu + CONFIRM_ITEMS: add `import { ConfirmMenu, CONFIRM_ITEMS } from '../components/confirm-menu';`.

- [ ] **Step 2:** Add `maxHeight={8}` to the EditBar `<textarea>` (in the `EditBar` component, ~line 109-114):

```tsx
        <textarea
          ref={ref}
          focused
          placeholder="编辑回复…"
          keyBindings={TEXTAREA_KEY_BINDINGS}
          maxHeight={8}
        />
```

- [ ] **Step 3:** Add confirm-index state + ref (after the other `useState`/`useRef` around line 131-143):

```tsx
  const [confirmIndex, setConfirmIndex] = useState(0);
  const confirmIndexRef = useRef(0);
  confirmIndexRef.current = confirmIndex;
```

- [ ] **Step 4:** Extract an edit-starter and reset confirmIndex on pending. Add this helper above `useKeyboard` (reuses the existing Ctrl+E body):

```tsx
  const startEdit = useCallback((p: Pending) => {
    editBaseRef.current = p.reply;
    editTurnIdRef.current = p.turnId;
    editEmailRef.current = p.emailContent;
    setEditText(p.reply.reply);
    setMode('edit');
  }, []);
```

Then wherever `setPending({ turnId..., reply..., emailContent... })` is called for a NEW pending (the reply branch in `runTurn` ~line 284, and the `handleEditSubmit` branches ~line 212/222), add `setConfirmIndex(0);` immediately after each `setPending(...)`.

- [ ] **Step 5:** In the `useKeyboard` handler, replace the Ctrl+E body to call `startEdit(p)`, and add ↑/↓/Enter handling for the confirm selector. The pending block (currently ~line 364-380) becomes:

```tsx
    // Reply confirm / edit / cancel require a pending reply.
    const p = pendingRef.current;
    if (!p) return;

    if (key.name === 'up') {
      key.preventDefault();
      setConfirmIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (key.name === 'down') {
      key.preventDefault();
      setConfirmIndex((i) => Math.min(CONFIRM_ITEMS.length - 1, i + 1));
      return;
    }
    if (key.name === 'return' || key.name === 'enter') {
      key.preventDefault();
      const idx = confirmIndexRef.current;
      if (idx === 0) void confirmReply();
      else if (idx === 1) startEdit(p);
      else setPending(null);
      return;
    }
    if (key.ctrl && key.name === 'e') {
      key.preventDefault();
      startEdit(p);
    } else if (key.ctrl && key.name === 'y') {
      key.preventDefault();
      void confirmReply();
    } else if (key.ctrl && key.name === 'n') {
      key.preventDefault();
      setPending(null);
    }
```

- [ ] **Step 6:** Compute `inputSlot` and pass it to SessionShell; remove `inputDisabled` and the EditBar-as-child. In the `return`, before `<SessionShell>`:

```tsx
  const inputSlot =
    mode === 'edit' ? (
      <EditBar initialText={editText} onSubmitEdit={handleEditSubmit} />
    ) : pending ? (
      <ConfirmMenu selectedIndex={confirmIndex} />
    ) : undefined;
```

Change the SessionShell open tag to drop `inputDisabled` and add `inputSlot`:

```tsx
    <SessionShell
      onSubmit={submit}
      loading={streaming}
      interruptible
      inputSlot={inputSlot}
      commands={commands}
    >
```

And DELETE the trailing `{mode === 'edit' && <EditBar initialText={editText} onSubmitEdit={handleEditSubmit} />}` line before `</SessionShell>` (EditBar now lives in `inputSlot`).

- [ ] **Step 7:** `bunx tsc -p packages/cli/tsconfig.json --noEmit` → exit 0. `bun build packages/cli/src/index.tsx --target bun --outdir /tmp/ae-opt` → success. `bun run test` → 40 pass.
- [ ] **Step 8:** Commit `feat(cli): confirm options selector in input region`.

---

## Task 6: Verify

- [ ] **Step 1:** Final gate: `bun run test` (40) + `bunx tsc -p packages/cli/tsconfig.json --noEmit` (exit 0) + `bun build packages/cli/src/index.tsx --target bun --outdir /tmp/ae-opt` (success).
- [ ] **Step 2 (user, needs TTY):** Live run — paste a long email → input caps at 8 rows + scrolls; after a reply, the input region shows the ConfirmMenu (确认并复制 highlighted); ↑/↓ moves selection, Enter executes; Ctrl+Y/E/N still work; 编辑 opens the 8-row EditBar; 取消/确认 return to the normal InputBar.

---

## Self-Review Notes (author checklist — applied)

- **Spec coverage:** input maxHeight 8 (Task 2 InputBar + Task 5 EditBar); ConfirmMenu vertical selector (Task 3); SessionShell inputSlot (Task 1); Repl confirmIndex + ↑↓Enter + Ctrl shortcuts retained + inputSlot(edit/pending/default) + EditBar→inputSlot (Task 5); ReplyMeta drops hint keeps pills (Task 4). Server/client/tests untouched.
- **Placeholder scan:** none — full code per step; the Task 2 `<box maxHeight>` fallback is a concrete conditional, not deferred work.
- **Type consistency:** `inputSlot?: React.ReactNode` (SessionShell) matches Repl's `inputSlot` value (ReactNode | undefined). `CONFIRM_ITEMS` length used for the down-clamp. `ConfirmMenu({selectedIndex})` matches the call `<ConfirmMenu selectedIndex={confirmIndex} />`. `startEdit(p: Pending)` matches both call sites. `setConfirmIndex` reset paired with every new `setPending`.
