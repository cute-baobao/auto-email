import { TextAttributes } from '@opentui/core';

export interface ReplyViewProps {
  template: string;
  reply: string;
  metadata: Record<string, string>;
  emailName?: string;
  emailFrom?: string;
}

export function ReplyView({ template, reply, metadata, emailName, emailFrom }: ReplyViewProps) {
  const tags = Object.entries(metadata);
  return (
    <box flexDirection="column" gap={1} paddingX={1}>
      <box flexDirection="row" gap={1}>
        <text fg="gray">匹配模板:</text>
        <text attributes={TextAttributes.BOLD} fg="cyan">
          {template}
        </text>
      </box>

      {(emailName || emailFrom) && (
        <box flexDirection="row" gap={1}>
          <text fg="gray">来件:</text>
          <text fg="white">{[emailName, emailFrom].filter(Boolean).join(' · ')}</text>
        </box>
      )}

      <box border borderColor="green" paddingX={1} flexDirection="column">
        <text fg="white">{reply}</text>
      </box>

      {tags.length > 0 && (
        <box flexDirection="row" gap={1}>
          <text fg="gray">元数据:</text>
          <box flexDirection="row" gap={1}>
            {tags.map(([k, v]) => (
              <text key={k} fg="magenta">{`[${k}: ${v}]`}</text>
            ))}
          </box>
        </box>
      )}

      <text fg="yellow" attributes={TextAttributes.DIM}>
        Ctrl+Y 确认（复制并保存）· Ctrl+N 取消
      </text>
    </box>
  );
}
