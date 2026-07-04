import {
  type KeyBinding,
  type TextareaRenderable,
} from '@opentui/core';
import { EmptyBorder } from './border';
import { StatusBar } from './status-bar';
import { CommandMenu } from './command-menu';
import { useCallback, useEffect, useRef } from 'react';
import { useCommandMenu } from './command-menu/use-command-menu';
import type { Command } from './command-menu/types';
import { LayerName, useKeyboardLayer } from '../providers/keyboard-layer';
import { useTheme } from '../providers/theme';

type Props = {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  commands: Command[];
};

export const TEXTAREA_KEY_BINDINGS: KeyBinding[] = [
  { name: 'return', action: 'submit' },
  { name: 'enter', action: 'submit' },
  { name: 'return', shift: true, action: 'newline' },
  { name: 'enter', shift: true, action: 'newline' },
];

export function InputBar({ onSubmit, disabled, commands }: Props) {
  const textareaRef = useRef<TextareaRenderable>(null);
  const onSubmitRef = useRef<() => void>(() => {});
  const {
    showCommandMenu,
    filteredCommands,
    selectedIndex,
    scrollRef,
    handleContentChange,
    resolveCommand,
    setSelectedIndex,
  } = useCommandMenu(commands);

  const { isTopLayer, setResponder } = useKeyboardLayer();
  const { colors } = useTheme();

  const handleSubmit = useCallback(() => {
    if (disabled) return;

    const textarea = textareaRef.current;
    if (!textarea) return;

    const text = textarea.plainText.trim();
    if (text.length === 0) return;

    onSubmit(text);
    textarea.setText('');
  }, [disabled, onSubmit]);

  const handleCommand = useCallback((command: Command | undefined) => {
    const textarea = textareaRef.current;
    if (!textarea || !command) return;

    textarea.setText('');
    textarea.insertText('/' + command.name + ' ');
  }, []);

  const handleExecuteCommand = (index: number) => {
    handleCommand(resolveCommand(index));
  };

  const handleTextareaContentChange = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    handleContentChange(textarea.plainText);
  }, [handleContentChange]);

  onSubmitRef.current = () => {
    if (disabled) return;

    if (showCommandMenu) {
      const command = resolveCommand(selectedIndex);
      handleCommand(command);
      return;
    }

    handleSubmit();
  };

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.onSubmit = () => {
      onSubmitRef.current();
    };
  }, []);

  useEffect(() => {
    setResponder(LayerName.Base, () => {
      if (disabled) return false;

      const textarea = textareaRef.current;
      if (textarea && textarea.plainText.length > 0) {
        textarea.setText('');
        return true;
      }
      return false;
    });

    return () => setResponder(LayerName.Base, null);
  }, [disabled, setResponder]);

  return (
    <box width={'100%'} alignItems="center">
      <box
        border={['left']}
        borderColor={colors.primary}
        customBorderChars={{
          ...EmptyBorder,
          vertical: '┃',
          bottomLeft: '╹',
        }}
        width={'100%'}
      >
        <box
          position="relative"
          justifyContent="center"
          paddingX={2}
          paddingY={1}
          backgroundColor={colors.surface}
          width={'100%'}
          gap={1}
        >
          {showCommandMenu && (
            <box
              position="absolute"
              bottom={'100%'}
              left={0}
              width={'100%'}
              backgroundColor={colors.surface}
              zIndex={10}
            >
              <CommandMenu
                commands={filteredCommands}
                selectedIndex={selectedIndex}
                scrollRef={scrollRef}
                onSelect={setSelectedIndex}
                onExecute={handleExecuteCommand}
              />
            </box>
          )}
          <textarea
            ref={textareaRef}
            focused={
              !disabled &&
              (isTopLayer(LayerName.Base) || isTopLayer(LayerName.Command))
            }
            onContentChange={handleTextareaContentChange}
            placeholder="Type a message..."
            keyBindings={TEXTAREA_KEY_BINDINGS}
          />
          <StatusBar />
        </box>
      </box>
    </box>
  );
}
