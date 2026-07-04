import { TextAttributes } from '@opentui/core';
import { useTheme } from '../providers/theme';

export function StatusBar() {
  const { colors } = useTheme();

  return (
    <box flexDirection="row" gap={1}>
      <text fg={colors.primary}>deepseek</text>
      <text attributes={TextAttributes.DIM} fg={colors.dimSeparator}>
        ›
      </text>
      <text>deepseek-v4-flash</text>
    </box>
  );
}
