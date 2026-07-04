import { useCallback, useEffect, useRef } from 'react';
import { useDialog } from '../../providers/dialog';
import { useTheme } from '../../providers/theme';
import type { Theme } from '../../theme';
import { DialogSearchList } from '../dialog-search-list';

export const ThemeDialog = () => {
  const { close } = useDialog();
  const { allThemes, setTheme, currentTheme } = useTheme();
  const confirmedRef = useRef(false);
  const originalThemeRef = useRef(currentTheme);

  useEffect(() => {
    // Store the original theme on open. Highlighting previews a theme live via
    // setTheme; if the user confirms we set confirmedRef, otherwise on close we
    // revert to the theme that was active when the dialog opened.
    return () => {
      if (!confirmedRef.current) {
        setTheme(originalThemeRef.current);
      }
    };
  }, [setTheme]);

  const handleSelect = useCallback(
    (theme: Theme) => {
      confirmedRef.current = true;
      setTheme(theme);
      close();
    },
    [setTheme, close],
  );

  const handleHighlight = useCallback(
    (theme: Theme) => {
      setTheme(theme);
    },
    [setTheme],
  );

  return (
    <DialogSearchList
      items={allThemes}
      onHighlight={handleHighlight}
      onSelect={handleSelect}
      filterFn={(t, q) => t.name.toLowerCase().includes(q.toLowerCase())}
      renderItem={(theme, isSelected) => (
        <text selectable={false} fg={isSelected ? 'black' : 'white'}>
          <em fg={theme.colors.primary}>██</em> {theme.name}
        </text>
      )}
      getKey={(theme) => theme.name}
      placeholder="Search themes..."
      emptyText="No matching themes"
    />
  );
};
