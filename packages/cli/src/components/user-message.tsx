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
