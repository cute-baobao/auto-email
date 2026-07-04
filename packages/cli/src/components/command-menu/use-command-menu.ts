import type { ScrollBoxRenderable } from '@opentui/core';
import { useMemo, useRef, useState, type RefObject } from 'react';
import type { Command } from './types';
import { useKeyboard } from '@opentui/react';
import { LayerName, useKeyboardLayer } from '../../providers/keyboard-layer';

type UseCommandMenuReturn = {
  showCommandMenu: boolean;
  filteredCommands: Command[];
  selectedIndex: number;
  scrollRef: RefObject<ScrollBoxRenderable | null>;
  handleContentChange: (text: string) => void;
  resolveCommand: (index: number) => Command | undefined;
  setSelectedIndex: (index: number) => void;
};

export function useCommandMenu(commands: Command[]): UseCommandMenuReturn {
  const [textValue, setTextValue] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const scrollRef = useRef<ScrollBoxRenderable>(null);
  const { pop, push, isTopLayer } = useKeyboardLayer();

  const query = showCommandMenu && textValue.startsWith('/') ? textValue.slice(1) : '';
  const filteredCommands = useMemo(
    () =>
      query.length === 0
        ? commands
        : commands.filter((c) => c.name.toLowerCase().startsWith(query.toLowerCase())),
    [commands, query],
  );

  const closeCommandMenu = () => {
    setShowCommandMenu(false);
    pop(LayerName.Command);
  };

  const handleContentChange = (text: string) => {
    setTextValue(text);
    setSelectedIndex(0);
    scrollRef.current?.scrollTo(0);
    const prefix = text.startsWith('/') ? text.slice(1) : null;
    if (prefix !== null && !prefix.includes(' ')) {
      setShowCommandMenu(true);
      push(LayerName.Command, () => {
        closeCommandMenu();
        return true;
      });
    } else {
      closeCommandMenu();
    }
  };

  const resolveCommand = (index: number): Command | undefined => {
    const command = filteredCommands[index];
    if (command) closeCommandMenu();
    return command;
  };

  useKeyboard((key) => {
    if (!showCommandMenu || !isTopLayer(LayerName.Command)) return;
    if (key.name === 'escape') {
      key.preventDefault();
      closeCommandMenu();
    } else if (key.name === 'up') {
      key.preventDefault();
      setSelectedIndex((prev) => {
        const ni = Math.max(prev - 1, 0);
        const sb = scrollRef.current;
        if (sb && ni < sb.scrollTop) sb.scrollTo(ni);
        return ni;
      });
    } else if (key.name === 'down') {
      key.preventDefault();
      setSelectedIndex((prev) => {
        const ni = Math.min(prev + 1, filteredCommands.length - 1);
        const sb = scrollRef.current;
        if (sb) {
          const visibleEnd = sb.scrollTop + sb.viewport.height - 1;
          if (ni > visibleEnd) sb.scrollTo(ni - sb.viewport.height + 1);
        }
        return ni;
      });
    }
  });

  return { showCommandMenu, filteredCommands, selectedIndex, scrollRef, handleContentChange, resolveCommand, setSelectedIndex };
}
