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
