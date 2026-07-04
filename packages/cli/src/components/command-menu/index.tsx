import type { ScrollBoxRenderable } from '@opentui/core';
import type { RefObject } from 'react';
import { useTheme } from '../../providers/theme';
import { useTerminalDimensions } from '@opentui/react';
import type { Command } from './types';

const MIN_NAME_WIDTH = 16;
const MAX_DESC_WIDTH = 40;

function trunate(line: string, width: number): string {
  if (line.length <= width) return line;
  return line.slice(0, Math.max(0, width - 1)) + '…';
}

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
  const { width: tw } = useTerminalDimensions();
  if (commands.length === 0) return null;
  const height = Math.min(commands.length, 6);
  const descMax = Math.max(0, tw - MIN_NAME_WIDTH - 8); // padding + "/" + gap
  const limit = Math.min(descMax, MAX_DESC_WIDTH);
  return (
    <scrollbox ref={scrollRef} height={height}>
      {commands.map((cmd, i) => {
        const selected = i === selectedIndex;
        return (
          <box key={cmd.name} flexDirection="row" paddingX={1} height={1}
            backgroundColor={selected ? colors.selection : undefined}
            onMouseMove={() => onSelect(i)} onMouseDown={() => onExecute(i)}>
            <box flexGrow={1}><text fg={selected ? 'black' : undefined}>{`/${cmd.name}`}</text></box>
            <text fg={selected ? 'black' : colors.dimSeparator}>{trunate(cmd.description, limit)}</text>
          </box>
        );
      })}
    </scrollbox>
  );
}
