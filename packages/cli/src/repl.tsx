import { TextAttributes, type KeyBinding, type TextareaRenderable } from '@opentui/core';
import { useKeyboard } from '@opentui/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import clipboard from 'clipboardy';
import type { RunResponse, SkillSummary, RunStreamEvent } from '@hynote/shared';
import { parseInput } from './slash';
import {
  getStats,
  listSkills,
  listTemplates,
  ManualFallbackError,
  runSkillStream,
  saveReply,
} from './client';
import { StatsView } from './renderers/stats';
import { ReplyView } from './renderers/reply';
import { ProgressView, type ProgressState } from './renderers/progress';
import { TemplatePicker } from './renderers/templates';

const HINT = '输入 /reply 粘贴邮件, /stats 看统计';
const CONFIRM_HINT = 'Ctrl+E 编辑 · Ctrl+Y 确认并复制 · Ctrl+N 取消';

type ReplyResult = Extract<RunResponse, { type: 'reply' }>;
type Mode = 'normal' | 'edit' | 'pick';

const KEY_BINDINGS: KeyBinding[] = [
  { name: 'return', action: 'submit' },
  { name: 'enter', action: 'submit' },
  { name: 'return', shift: true, action: 'newline' },
  { name: 'enter', shift: true, action: 'newline' },
];

export function Repl() {
  const textareaRef = useRef<TextareaRenderable>(null);
  const onSubmitRef = useRef<() => void>(() => {});

  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<RunResponse | null>(null);
  const [status, setStatus] = useState<string>(HINT);
  const [mode, setMode] = useState<Mode>('normal');
  const [templates, setTemplates] = useState<{ name: string; body: string }[] | null>(null);
  const [skills, setSkills] = useState<SkillSummary[] | null>(null);
  const [progress, setProgress] = useState<ProgressState>({ reasoning: '', text: '', tools: [] });
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const resultRef = useRef<RunResponse | null>(null);
  const templatesRef = useRef<{ name: string; body: string }[] | null>(null);
  // Base reply carried through the edit buffer: template + metadata + sender are
  // preserved, only `reply` text is replaced on submit. Metadata-tag correction
  // is intentionally out of scope for this pass (edit only touches reply body).
  const editBaseRef = useRef<ReplyResult | null>(null);
  const lastInputRef = useRef<string>('');
  resultRef.current = result;

  const slashHint =
    skills && skills.length > 0
      ? `可用指令：${skills.map((s) => `/${s.name}`).join(' · ')}`
      : HINT;

  const pushLine = useCallback((line: string) => {
    setLog((prev) => [...prev, line]);
  }, []);

  const confirmReply = useCallback(async (res: ReplyResult) => {
    try {
      await saveReply({
        template: res.template,
        email_from: res.email_from,
        email_name: res.email_name,
        email_content: lastInputRef.current,
        reply_content: res.reply,
        metadata: res.metadata,
        confirmed: true,
      });
      await clipboard.write(res.reply);
      setStatus('已复制到剪贴板并保存');
    } catch (err) {
      setStatus(`保存失败：${(err as Error).message}`);
    } finally {
      setResult(null);
    }
  }, []);

  // Load skills for the dynamic slash menu; stay silent if the server is down.
  useEffect(() => {
    let ignore = false;
    void listSkills()
      .then((s) => {
        if (!ignore) setSkills(s);
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, []);

  const submitRaw = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return;

      pushLine(`> ${trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed}`);
      setResult(null);

      const parsed = parseInput(trimmed);
      const skill = parsed.skill;
      const text = parsed.text;

      try {
        if (skill === 'stats' && !text) {
          const { panels } = await getStats();
          setResult({ type: 'stats', skill: 'stats', panels });
          setStatus(HINT);
          return;
        }

        setStatus('agent 处理中…（Esc 取消）');
        setProgress({ reasoning: '', text: '', tools: [] });
        setStreaming(true);
        const ac = new AbortController();
        abortRef.current = ac;
        try {
          const res = await runSkillStream(
            text || trimmed,
            skill,
            (ev: RunStreamEvent) => {
              setProgress((p) => {
                if (ev.type === 'reasoning-delta') return { ...p, reasoning: p.reasoning + ev.text };
                if (ev.type === 'text-delta') return { ...p, text: p.text + ev.text };
                if (ev.type === 'tool-call')
                  return { ...p, tools: [...p.tools, { name: ev.toolName, done: false }] };
                if (ev.type === 'tool-result') {
                  const tools = [...p.tools];
                  for (let i = tools.length - 1; i >= 0; i--)
                    if (!tools[i]!.done) {
                      tools[i] = { ...tools[i]!, done: true };
                      break;
                    }
                  return { ...p, tools };
                }
                return p;
              });
            },
            ac.signal,
          );
          setStreaming(false);
          setProgress({ reasoning: '', text: '', tools: [] });
          setResult(res);
          if (res.type === 'reply') {
            lastInputRef.current = text || trimmed;
            setStatus(CONFIRM_HINT);
          } else {
            setStatus(HINT);
          }
        } catch (err) {
          setStreaming(false);
          setProgress({ reasoning: '', text: '', tools: [] });
          if ((err as Error).name === 'AbortError') {
            setStatus('已取消');
            return;
          }
          throw err;
        }
      } catch (err) {
        if (err instanceof ManualFallbackError) {
          // AI unavailable: fall back to manual template selection.
          lastInputRef.current = text || trimmed;
          try {
            const tmpls = await listTemplates();
            templatesRef.current = tmpls;
            setTemplates(tmpls);
            setResult(null);
            setMode('pick');
            setStatus('AI 不可用，请手动选择模板：输入序号并回车（Ctrl+N 取消）');
          } catch (e) {
            templatesRef.current = null;
            setTemplates(null);
            setStatus(`AI 不可用，且模板加载失败：${(e as Error).message}`);
          }
          return;
        }
        setResult(null);
        setStatus(`处理失败：${(err as Error).message}。请重试或改用 /reply 手动选择模板`);
      }
    },
    [pushLine],
  );

  // Manual-pick submit: parse the typed index, then load the chosen template
  // body into the edit buffer so the user fills placeholders (reuses edit flow).
  const handlePick = useCallback((raw: string) => {
    const list = templatesRef.current;
    const textarea = textareaRef.current;
    if (!list || !textarea) return;

    const n = Number.parseInt(raw.trim(), 10);
    if (!Number.isInteger(n) || n < 1 || n > list.length) {
      setStatus(`请输入 1-${list.length} 之间的序号`);
      textarea.setText('');
      return;
    }

    const chosen = list[n - 1]!;
    editBaseRef.current = {
      type: 'reply',
      skill: 'reply',
      template: chosen.name,
      reply: '',
      metadata: {},
    };
    templatesRef.current = null;
    setTemplates(null);
    setMode('edit');
    textarea.setText(chosen.body);
    setStatus('填写模板占位符（如 {{firstName}}）后回车，再按 Ctrl+Y 确认并复制');
  }, []);

  // Edit submit: replace only the reply text, keep template/metadata/sender.
  const handleEditSubmit = useCallback((raw: string) => {
    const base = editBaseRef.current;
    const textarea = textareaRef.current;
    if (!textarea) return;
    if (!base) {
      setMode('normal');
      textarea.setText('');
      setStatus(HINT);
      return;
    }
    const edited = raw.trim().length > 0 ? raw : base.reply;
    const next: ReplyResult = { ...base, reply: edited };
    editBaseRef.current = null;
    setMode('normal');
    setResult(next);
    resultRef.current = next;
    textarea.setText('');
    setStatus(CONFIRM_HINT);
  }, []);

  onSubmitRef.current = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const raw = textarea.plainText;

    if (mode === 'pick') {
      handlePick(raw);
      return;
    }
    if (mode === 'edit') {
      handleEditSubmit(raw);
      return;
    }
    textarea.setText('');
    void submitRaw(raw);
  };

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.onSubmit = () => onSubmitRef.current();
  }, []);

  useKeyboard((key) => {
    // Esc cancels an in-flight streaming run.
    if (streaming && key.name === 'escape') {
      abortRef.current?.abort();
      return;
    }

    // Ctrl+N escapes edit or manual-pick back to normal.
    if ((mode === 'edit' || mode === 'pick') && key.ctrl && key.name === 'n') {
      key.preventDefault();
      editBaseRef.current = null;
      templatesRef.current = null;
      setTemplates(null);
      setMode('normal');
      textareaRef.current?.setText('');
      setStatus(HINT);
      return;
    }

    if (mode !== 'normal') return;

    const current = resultRef.current;
    if (!current || current.type !== 'reply') return;

    if (key.ctrl && key.name === 'e') {
      key.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;
      editBaseRef.current = current;
      textarea.setText(current.reply);
      setMode('edit');
      setStatus('编辑回复：修改后回车提交，再按 Ctrl+Y 确认（Ctrl+N 取消）');
    } else if (key.ctrl && key.name === 'y') {
      key.preventDefault();
      void confirmReply(current);
    } else if (key.ctrl && key.name === 'n') {
      key.preventDefault();
      setResult(null);
      resultRef.current = null;
      setStatus(HINT);
    }
  });

  return (
    <box flexDirection="column" width="100%" height="100%">
      <box paddingX={1} flexDirection="column">
        <text fg="cyan" attributes={TextAttributes.BOLD}>
          HyNote Email Agent
        </text>
        <text fg="gray">{slashHint}</text>
      </box>

      <scrollbox flexGrow={1} paddingX={1}>
        <box flexDirection="column">
          {log.map((line, i) => (
            <text key={`${i}-${line}`} fg="gray">
              {line}
            </text>
          ))}
        </box>

        {mode === 'pick' && templates && <TemplatePicker templates={templates} />}

        {streaming && <ProgressView state={progress} />}

        {result?.type === 'reply' && (
          <ReplyView
            template={result.template}
            reply={result.reply}
            metadata={result.metadata}
            emailName={result.email_name}
            emailFrom={result.email_from}
          />
        )}
        {result?.type === 'stats' && <StatsView panels={result.panels} />}
        {result?.type === 'text' && (
          <box paddingX={1}>
            <text fg="white">{result.text}</text>
          </box>
        )}
      </scrollbox>

      <box paddingX={1} flexDirection="column">
        <box border borderColor="gray" paddingX={1}>
          <textarea
            ref={textareaRef}
            focused
            placeholder="输入消息，回车发送…"
            keyBindings={KEY_BINDINGS}
          />
        </box>
        <text fg="yellow">{status}</text>
      </box>
    </box>
  );
}
