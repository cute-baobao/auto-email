import { TextAttributes } from '@opentui/core';
import { useTheme } from '../providers/theme';

export function ReplyMeta({ metadata }: { metadata: Record<string, string> }) {
  const { colors } = useTheme();
  const entries = Object.entries(metadata);
  return (
    <box flexDirection="column" paddingX={3} gap={0}>
      {entries.length > 0 && (
        <box flexDirection="row" gap={1}>
          {entries.map(([k, v]) => (
            <text key={k} fg={colors.selection}>{`${k}: ${v}`}</text>
          ))}
        </box>
      )}
      <text attributes={TextAttributes.DIM}>Ctrl+E 编辑 · Ctrl+Y 确认并复制 · Ctrl+N 取消</text>
    </box>
  );
}
