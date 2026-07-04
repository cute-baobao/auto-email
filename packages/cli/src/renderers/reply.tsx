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
