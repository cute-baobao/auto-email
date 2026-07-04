import { TextAttributes, type TextareaRenderable } from '@opentui/core';
import { useKeyboard } from '@opentui/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import clipboard from 'clipboardy';
import type { RunResponse } from '@hynote/shared';
import { parseInput } from './slash';
import { getStats, runSkill, saveReply } from './client';
import { StatsView } from './renderers/stats';
import { ReplyView } from './renderers/reply';

const HINT = '输入 /reply 粘贴邮件, /stats 看统计';

const KEY_BINDINGS = [
  { name: 'return', action: 'submit' as const },
  { name: 'enter', action: 'submit' as const },
];

export function Repl() {
  const textareaRef = useRef<TextareaRenderable>(null);
  const onSubmitRef = useRef<() => void>(() => {});

  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<RunResponse | null>(null);
  const [status, setStatus] = useState<string>(HINT);

  const resultRef = useRef<RunResponse | null>(null);
  const lastInputRef = useRef<string>('');
  resultRef.current = result;

  const pushLine = useCallback((line: string) => {
    setLog((prev) => [...prev, line]);
  }, []);

  const confirmReply = useCallback(
    async (res: Extract<RunResponse, { type: 'reply' }>) => {
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
    },
    [],
  );

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

        setStatus('agent 处理中...');
        const res = await runSkill(text || trimmed, skill);
        setResult(res);
        if (res.type === 'reply') {
          lastInputRef.current = text || trimmed;
          setStatus('按 Ctrl+Y 确认（复制并保存），Ctrl+N 取消');
        } else {
          setStatus(HINT);
        }
      } catch (err) {
        setResult(null);
        setStatus(`处理失败：${(err as Error).message}。请重试或改用 /reply 手动选择模板`);
      }
    },
    [pushLine],
  );

  onSubmitRef.current = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const raw = textarea.plainText;
    textarea.setText('');
    void submitRaw(raw);
  };

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.onSubmit = () => onSubmitRef.current();
  }, []);

  useKeyboard((key) => {
    const current = resultRef.current;
    if (!current || current.type !== 'reply') return;
    if (key.ctrl && key.name === 'y') {
      key.preventDefault();
      void confirmReply(current);
    } else if (key.ctrl && key.name === 'n') {
      key.preventDefault();
      setResult(null);
      setStatus(HINT);
    }
  });

  return (
    <box flexDirection="column" width="100%" height="100%">
      <box paddingX={1} flexDirection="column">
        <text fg="cyan" attributes={TextAttributes.BOLD}>
          HyNote Email Agent
        </text>
        <text fg="gray">{HINT}</text>
      </box>

      <scrollbox flexGrow={1} paddingX={1}>
        <box flexDirection="column">
          {log.map((line, i) => (
            <text key={`${i}-${line}`} fg="gray">
              {line}
            </text>
          ))}
        </box>

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
