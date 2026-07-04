import { TextAttributes, type TextareaRenderable } from '@opentui/core';
import { useKeyboard } from '@opentui/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import clipboard from 'clipboardy';
import type { RunResponse, RunStreamEvent, StatsPanel } from '@hynote/shared';
import { parseInput } from '../slash';
import { shouldConfirm } from '../should-confirm';
import {
  getStats,
  listSkills,
  listTemplates,
  ManualFallbackError,
  runSkillStream,
  saveReply,
} from '../client';
import {
  BotMessage,
  eventsToParts,
  type HynoteMessagePart,
} from '../components/bot-message';
import { ReplyMeta } from '../renderers/reply';
import { StatsView } from '../renderers/stats';
import { SessionShell } from '../components/session-shell';
import { Header } from '../components/header';
import { TEXTAREA_KEY_BINDINGS } from '../components/input-bar';
import { ConfirmMenu, CONFIRM_ITEMS } from '../components/confirm-menu';
import { EmptyBorder } from '../components/border';
import { UserMessage } from '../components/user-message';
import { TemplatePicker } from '../components/dialogs/template-dialog';
import { ThemeDialog } from '../components/dialogs/theme-dialog';
import type { Command } from '../components/command-menu/types';
import { useToast } from '../providers/toast';
import { useDialog } from '../providers/dialog';
import { useTheme } from '../providers/theme';
import { LayerName, useKeyboardLayer } from '../providers/keyboard-layer';

type ReplyResult = Extract<RunResponse, { type: 'reply' }>;
type Mode = 'normal' | 'edit';
type Template = { name: string; body: string };

// One conversational turn. Streamed events accumulate into `events`; the final
// `reply`/`stats` are stashed for rendering + the confirm/edit flow.
type Turn = {
  id: number;
  input?: string;
  events: RunStreamEvent[];
  streaming: boolean;
  reply?: ReplyResult;
  stats?: StatsPanel[];
  error?: string;
};

// Which reply is currently awaiting Ctrl+Y/E/N. `emailContent` is the original
// input, saved alongside the reply on confirm.
type Pending = { turnId: number; reply: ReplyResult; emailContent: string };

const PROVIDER = 'deepseek';
const MODEL = 'deepseek-v4-flash';

// Pill labels for a confirmed/pending reply: template + sender + skill metadata.
function metaForReply(reply: ReplyResult): Record<string, string> {
  const meta: Record<string, string> = { 模板: reply.template };
  const sender = [reply.email_name, reply.email_from].filter(Boolean).join(' · ');
  if (sender) meta['来件'] = sender;
  for (const [k, v] of Object.entries(reply.metadata)) meta[k] = v;
  return meta;
}

// Dedicated, pre-filled textarea shown only in edit mode. The SessionShell input
// is disabled while this is mounted, so exactly one textarea holds focus.
function EditBar({
  initialText,
  onSubmitEdit,
}: {
  initialText: string;
  onSubmitEdit: (text: string) => void;
}) {
  const { colors } = useTheme();
  const ref = useRef<TextareaRenderable>(null);
  const cbRef = useRef(onSubmitEdit);
  cbRef.current = onSubmitEdit;

  useEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;
    textarea.setText(initialText);
    textarea.onSubmit = () => cbRef.current(textarea.plainText);
  }, [initialText]);

  return (
    <box
      border={['left']}
      borderColor={colors.primary}
      customBorderChars={{ ...EmptyBorder, vertical: '┃', bottomLeft: '╹' }}
      width="100%"
    >
      <box
        paddingX={2}
        paddingY={1}
        gap={1}
        backgroundColor={colors.surface}
        width="100%"
      >
        <text attributes={TextAttributes.DIM}>
          编辑回复：修改后回车提交，再按 Ctrl+Y 确认（Ctrl+N 取消）
        </text>
        <textarea
          ref={ref}
          focused
          placeholder="编辑回复…"
          keyBindings={TEXTAREA_KEY_BINDINGS}
          maxHeight={8}
        />
      </box>
    </box>
  );
}

export function Repl() {
  const { colors } = useTheme();
  const toast = useToast();
  const dialog = useDialog();
  const { isTopLayer } = useKeyboardLayer();

  const [turns, setTurns] = useState<Turn[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [mode, setMode] = useState<Mode>('normal');
  const [pending, setPending] = useState<Pending | null>(null);
  const [commands, setCommands] = useState<Command[]>([]);
  const [editText, setEditText] = useState('');

  const [confirmIndex, setConfirmIndex] = useState(0);
  const [scrollKey, setScrollKey] = useState(0);
  const confirmIndexRef = useRef(0);
  confirmIndexRef.current = confirmIndex;

  const idRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const streamingRef = useRef(false);
  const modeRef = useRef<Mode>('normal');
  const pendingRef = useRef<Pending | null>(null);
  // Edit buffer carriers: template/metadata/sender are preserved across an edit;
  // only the reply body is replaced. `editTurnId` is null for a manual-template
  // pick (a fresh turn is created on submit).
  const editBaseRef = useRef<ReplyResult | null>(null);
  const editTurnIdRef = useRef<number | null>(null);
  const editEmailRef = useRef<string>('');

  streamingRef.current = streaming;
  modeRef.current = mode;
  pendingRef.current = pending;

  const addTurn = useCallback((turn: Turn) => {
    setTurns((prev) => [...prev, turn]);
    setScrollKey((k) => k + 1);
  }, []);

  const updateTurn = useCallback((id: number, fn: (t: Turn) => Turn) => {
    setTurns((prev) => prev.map((t) => (t.id === id ? fn(t) : t)));
    setScrollKey((k) => k + 1);
  }, []);

  // Load skills for the dynamic slash menu; stay silent if the server is down.
  useEffect(() => {
    let ignore = false;
    void listSkills()
      .then((skills) => {
        if (!ignore) {
          setCommands(skills.map((s) => ({ name: s.name, description: s.description })));
        }
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, []);

  const confirmReply = useCallback(async () => {
    const p = pendingRef.current;
    if (!p) return;
    try {
      await saveReply({
        template: p.reply.template,
        email_from: p.reply.email_from,
        email_name: p.reply.email_name,
        email_content: p.emailContent,
        reply_content: p.reply.reply,
        metadata: p.reply.metadata,
        confirmed: true,
      });
      await clipboard.write(p.reply.reply);
      toast.show({ message: '已复制并保存', variant: 'success' });
    } catch (err) {
      toast.show({ message: `保存失败：${(err as Error).message}`, variant: 'error' });
    } finally {
      // Keep the reply body in history; only retire the confirm affordance.
      setPending(null);
    }
  }, [toast]);

  // Edit submit: replace only the reply body, keep template/metadata/sender.
  const handleEditSubmit = useCallback(
    (raw: string) => {
      const base = editBaseRef.current;
      const email = editEmailRef.current;
      const turnId = editTurnIdRef.current;
      editBaseRef.current = null;
      editTurnIdRef.current = null;
      setMode('normal');
      setEditText('');
      if (!base) return;

      const edited = raw.trim().length > 0 ? raw : base.reply;
      const next: ReplyResult = { ...base, reply: edited };

      if (turnId != null) {
        updateTurn(turnId, (t) => ({ ...t, reply: next, error: undefined }));
        setPending({ turnId, reply: next, emailContent: email });
        setConfirmIndex(0);
      } else {
        const id = ++idRef.current;
        addTurn({
          id,
          input: `手动模板：${next.template}`,
          events: [],
          streaming: false,
          reply: next,
        });
        setPending({ turnId: id, reply: next, emailContent: email });
        setConfirmIndex(0);
      }
    },
    [addTurn, updateTurn],
  );

  // Manual-fallback pick: load the chosen template body into the edit buffer so
  // the user fills placeholders, then confirms. `editEmailRef` was set before the
  // dialog opened. The dialog closes itself after onPick.
  const handlePickTemplate = useCallback((t: Template) => {
    editBaseRef.current = {
      type: 'reply',
      skill: 'reply',
      template: t.name,
      reply: '',
      metadata: {},
    };
    editTurnIdRef.current = null;
    setEditText(t.body);
    setMode('edit');
  }, []);

  const runTurn = useCallback(
    async (raw: string) => {
      const { skill, text } = parseInput(raw);

      // `/stats` with no argument short-circuits to a direct (non-streamed) fetch.
      if (skill === 'stats' && !text) {
        const id = ++idRef.current;
        try {
          const { panels } = await getStats();
          addTurn({ id, input: raw, events: [], streaming: false, stats: panels });
        } catch (err) {
          addTurn({
            id,
            input: raw,
            events: [],
            streaming: false,
            error: (err as Error).message,
          });
        }
        return;
      }

      const id = ++idRef.current;
      addTurn({ id, input: raw, events: [], streaming: true });
      const ac = new AbortController();
      abortRef.current = ac;
      setStreaming(true);

      try {
        const res = await runSkillStream(
          text || raw,
          skill,
          (ev: RunStreamEvent) => {
            updateTurn(id, (t) => ({ ...t, events: [...t.events, ev] }));
          },
          ac.signal,
        );
        setStreaming(false);
        if (res.type === 'reply') {
          updateTurn(id, (t) => ({ ...t, streaming: false, reply: res }));
          if (shouldConfirm(res)) {
            setPending({ turnId: id, reply: res, emailContent: text || raw });
            setConfirmIndex(0);
          }
        } else if (res.type === 'stats') {
          updateTurn(id, (t) => ({ ...t, streaming: false, stats: res.panels }));
        } else {
          updateTurn(id, (t) => ({ ...t, streaming: false }));
        }
      } catch (err) {
        setStreaming(false);
        updateTurn(id, (t) => ({ ...t, streaming: false }));

        if (ac.signal.aborted) {
          toast.show({ message: '已取消', variant: 'info' });
          return;
        }
        if (err instanceof ManualFallbackError) {
          // AI unavailable: fall back to manual template selection.
          editEmailRef.current = text || raw;
          try {
            const templates = await listTemplates();
            dialog.open({
              title: '选择模板',
              children: <TemplatePicker templates={templates} onPick={handlePickTemplate} />,
            });
          } catch (e) {
            toast.show({
              message: `AI 不可用，且模板加载失败：${(e as Error).message}`,
              variant: 'error',
            });
          }
          return;
        }
        toast.show({ message: `处理失败：${(err as Error).message}`, variant: 'error' });
      } finally {
        abortRef.current = null;
      }
    },
    [addTurn, updateTurn, toast, dialog, handlePickTemplate],
  );

  const submit = useCallback(
    (raw: string) => {
      if (streamingRef.current) return;
      const trimmed = raw.trim();
      if (!trimmed) return;
      void runTurn(trimmed);
    },
    [runTurn],
  );

  const startEdit = useCallback((p: Pending) => {
    editBaseRef.current = p.reply;
    editTurnIdRef.current = p.turnId;
    editEmailRef.current = p.emailContent;
    setEditText(p.reply.reply);
    setMode('edit');
  }, []);

  useKeyboard((key) => {
    // Esc aborts an in-flight stream — only at the Base layer, so an open dialog
    // keeps Esc for itself.
    if (streamingRef.current && key.name === 'escape' && isTopLayer(LayerName.Base)) {
      key.preventDefault();
      abortRef.current?.abort();
      return;
    }

    // Never fight a dialog or the command menu.
    if (!isTopLayer(LayerName.Base)) return;

    // Edit mode: only Ctrl+N cancels; EditBar's textarea owns everything else.
    if (modeRef.current === 'edit') {
      if (key.ctrl && key.name === 'n') {
        key.preventDefault();
        editBaseRef.current = null;
        editTurnIdRef.current = null;
        setMode('normal');
        setEditText('');
      }
      return;
    }

    // Ctrl+T opens the theme dialog whenever Base is on top.
    if (key.ctrl && key.name === 't') {
      key.preventDefault();
      dialog.open({ title: '主题', children: <ThemeDialog /> });
      return;
    }

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
  });

  const inputSlot =
    mode === 'edit' ? (
      <EditBar initialText={editText} onSubmitEdit={handleEditSubmit} />
    ) : pending ? (
      <ConfirmMenu selectedIndex={confirmIndex} />
    ) : undefined;

  return (
    <SessionShell
      onSubmit={submit}
      loading={streaming}
      interruptible
      inputSlot={inputSlot}
      commands={commands}
      scrollKey={scrollKey}
    >
      <Header />
      {turns.map((turn) => {
        const parts: HynoteMessagePart[] = eventsToParts(turn.events);
        // Only the canonical filled reply (real email = non-empty template) is
        // appended; a non-email reply's conversational text already streamed in.
        if (turn.reply && shouldConfirm(turn.reply)) {
          parts.push({ type: 'text', text: turn.reply.reply });
        }
        const showBot = parts.length > 0;
        return (
          <box key={turn.id} flexDirection="column" width="100%">
            {turn.input && <UserMessage message={turn.input} />}
            {showBot && (
              <BotMessage
                parts={parts}
                provider={PROVIDER}
                model={MODEL}
                streaming={turn.streaming}
              />
            )}
            {turn.reply && pending?.turnId === turn.id && (
              <ReplyMeta metadata={metaForReply(turn.reply)} />
            )}
            {turn.stats && <StatsView panels={turn.stats} />}
            {turn.error && (
              <box paddingX={3}>
                <text fg={colors.error}>{turn.error}</text>
              </box>
            )}
          </box>
        );
      })}
    </SessionShell>
  );
}
