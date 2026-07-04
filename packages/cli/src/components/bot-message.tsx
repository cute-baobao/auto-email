import type { RunStreamEvent } from '@auto-email/shared';
import { SyntaxStyle, TextAttributes } from '@opentui/core';
import { useState } from 'react';
import { useTheme } from '../providers/theme';

export type AutoEmailMessagePart =
  | { type: 'reasoning'; text: string }
  | { type: 'tool'; id: string; name: string; status: 'calling' | 'done' }
  | { type: 'text'; text: string };

type PartGroup = {
  type: AutoEmailMessagePart['type'];
  parts: AutoEmailMessagePart[];
  key: string;
};

function groupConsecutiveParts(parts: AutoEmailMessagePart[]): PartGroup[] {
  const groups: PartGroup[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    const last = groups[groups.length - 1];
    if (last && last.type === part.type) {
      last.parts.push(part);
    } else {
      const key =
        part.type === 'tool'
          ? `group-tool-${part.id}`
          : `group-${part.type}-${i}`;
      groups.push({ type: part.type, parts: [part], key });
    }
  }
  return groups;
}

function formatToolName(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function BotMessage({
  parts,
  provider,
  model,
  streaming = false,
}: {
  parts: AutoEmailMessagePart[];
  provider: string;
  model: string;
  streaming?: boolean;
}) {
  const { colors } = useTheme();
  const [syntaxStyle] = useState(() => {
    const style = SyntaxStyle.create();
    style.registerStyle('markup.strong', { bold: true });
    style.registerStyle('markup.link', { fg: colors.info });
    style.registerStyle('markup.raw', { fg: colors.success });
    return style;
  });

  return (
    <box width="100%" alignItems="center">
      {groupConsecutiveParts(parts).map((group) => (
        <box key={group.key} paddingY={1} width="100%">
          {group.parts.map((part, j) => {
            if (part.type === 'reasoning') {
              return (
                <box
                  key={`reasoning-${j}`}
                  border={['left']}
                  borderColor={colors.thinkingBorder}
                  customBorderChars={{
                    topLeft: '',
                    bottomLeft: '',
                    vertical: '│',
                    topRight: '',
                    bottomRight: '',
                    horizontal: ' ',
                    bottomT: '',
                    topT: '',
                    cross: '',
                    leftT: '',
                    rightT: '',
                  }}
                  width="100%"
                  paddingX={2}
                >
                  <text attributes={TextAttributes.DIM}>
                    <em fg={colors.thinking}>Thinking:</em> {part.text}
                  </text>
                </box>
              );
            }
            if (part.type === 'tool') {
              return (
                <box
                  key={part.id}
                  border={['left']}
                  borderColor={colors.thinkingBorder}
                  customBorderChars={{
                    topLeft: '',
                    bottomLeft: '',
                    vertical: '│',
                    topRight: '',
                    bottomRight: '',
                    horizontal: ' ',
                    bottomT: '',
                    topT: '',
                    cross: '',
                    leftT: '',
                    rightT: '',
                  }}
                  width="100%"
                  paddingX={2}
                >
                  <text attributes={TextAttributes.DIM}>
                    <em fg={colors.info}>{formatToolName(part.name)}:</em>
                    {part.status === 'calling' ? ' …' : ''}
                  </text>
                </box>
              );
            }
            if (part.type === 'text') {
              return (
                <box key={`text-${j}`} paddingX={3} width="100%">
                  <markdown
                    syntaxStyle={syntaxStyle}
                    content={part.text}
                    streaming={streaming}
                  />
                </box>
              );
            }
            return null;
          })}
        </box>
      ))}

      <box paddingX={3} paddingBottom={1} gap={1} width="100%">
        <box flexDirection="row" gap={2}>
          <text fg={colors.primary}>◉</text>
          <box flexDirection="row" gap={1}>
            <text attributes={TextAttributes.DIM}>{provider}</text>
            <text attributes={TextAttributes.DIM} fg={colors.dimSeparator}>
              &gt;
            </text>
            <text attributes={TextAttributes.DIM}>{model}</text>
            {streaming && (
              <>
                <text attributes={TextAttributes.DIM} fg={colors.dimSeparator}>
                  &gt;
                </text>
                <text attributes={TextAttributes.DIM}>streaming…</text>
              </>
            )}
          </box>
        </box>
      </box>
    </box>
  );
}

export function eventsToParts(events: RunStreamEvent[]): AutoEmailMessagePart[] {
  const parts: AutoEmailMessagePart[] = [];
  for (const ev of events) {
    if (ev.type === 'reasoning-delta') {
      const last = parts[parts.length - 1];
      if (last?.type === 'reasoning') {
        last.text += ev.text;
      } else {
        parts.push({ type: 'reasoning', text: ev.text });
      }
    } else if (ev.type === 'text-delta') {
      const last = parts[parts.length - 1];
      if (last?.type === 'text') {
        last.text += ev.text;
      } else {
        parts.push({ type: 'text', text: ev.text });
      }
    } else if (ev.type === 'tool-call') {
      parts.push({ type: 'tool', id: ev.toolCallId, name: ev.toolName, status: 'calling' });
    } else if (ev.type === 'tool-result') {
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]!;
        if (p.type === 'tool' && p.id === ev.toolCallId && p.status === 'calling') {
          p.status = 'done';
          break;
        }
      }
    }
  }
  return parts;
}
