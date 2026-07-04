import { TextAttributes } from '@opentui/core';
import { InputBar } from './input-bar';
import { Spinner } from './spinner';
import type { Command } from './command-menu/types';

type Props = {
  children?: React.ReactNode;
  onSubmit: (text: string) => void;
  inputDisabled?: boolean;
  loading?: boolean;
  interruptible?: boolean;
  commands: Command[];
};

export function SessionShell({
  children,
  onSubmit,
  inputDisabled,
  loading,
  interruptible = false,
  commands,
}: Props) {
  return (
    <box
      flexDirection="column"
      width="100%"
      height="100%"
      flexGrow={1}
      paddingY={1}
      paddingX={2}
      gap={1}
    >
      <scrollbox flexGrow={1} width="100%" stickyScroll stickyStart="bottom">
        <box gap={1}>{children}</box>
      </scrollbox>
      <box flexShrink={0}>
        <InputBar onSubmit={onSubmit} disabled={inputDisabled} commands={commands} />
      </box>
      <box
        flexShrink={0}
        flexDirection="row"
        alignItems="center"
        justifyContent="space-between"
        width="100%"
        height={1}
        gap={2}
        paddingLeft={1}
      >
        <box flexDirection="row" alignItems="center" gap={2}>
          {loading ? (
            <>
              <Spinner />
              {interruptible && (
                <text attributes={TextAttributes.DIM}>esc to interrupt</text>
              )}
            </>
          ) : null}
        </box>
        <box flexDirection="row" alignItems="center" gap={1} marginLeft="auto">
          <text attributes={TextAttributes.DIM}>/ commands · Ctrl+T theme</text>
        </box>
      </box>
    </box>
  );
}
