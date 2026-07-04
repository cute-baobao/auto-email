import type { ScrollBoxRenderable } from '@opentui/core';
import type { RefObject } from 'react';
import { useTheme } from '../../providers/theme';
import type { Command } from './types';

export function CommandMenu({
  commands, selectedIndex, scrollRef, onSelect, onExecute,
}: {
  commands: Command[];
  selectedIndex: number;
  scrollRef: RefObject<ScrollBoxRenderable | null>;
  onSelect: (i: number) => void;
  onExecute: (i: number) => void;
}) {
  const { colors } = useTheme();
  if (commands.length === 0) return null;
  const height = Math.min(commands.length, 6);
  return (
    <scrollbox ref={scrollRef} height={height}>
      {commands.map((cmd, i) => {
        const selected = i === selectedIndex;
        return (
          <box key={cmd.name} flexDirection="row" paddingX={1} height={1}
            backgroundColor={selected ? colors.selection : undefined}
            onMouseMove={() => onSelect(i)} onMouseDown={() => onExecute(i)}>
            <box flexGrow={1}><text fg={selected ? 'black' : undefined}>{`/${cmd.name}`}</text></box>
            <text fg={selected ? 'black' : colors.dimSeparator}>{cmd.description}</text>
          </box>
        );
      })}
    </scrollbox>
  );
}
