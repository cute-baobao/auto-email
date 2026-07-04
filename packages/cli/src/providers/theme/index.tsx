import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createContext, useCallback, useContext, useState } from 'react';
import { DEFAULT_THEME, THEMES, type Theme, type ThemeColors } from '../../theme';

const CONFIG_DIR = join(homedir(), '.bao-auto-mail');
const PREFS_PATH = join(CONFIG_DIR, 'preferences.json');

function getInitialTheme(): Theme {
  try {
    const prefs = JSON.parse(readFileSync(PREFS_PATH, 'utf-8')) as {
      themeName?: string;
    };
    const saved = THEMES.find((t) => t.name === prefs.themeName);
    return saved ?? DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function persistTheme(theme: Theme) {
  try {
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(
      PREFS_PATH,
      JSON.stringify({ themeName: theme.name }, null, 2),
      'utf-8',
    );
  } catch {
    // ignore
  }
}

type ThemeContextValue = {
  colors: ThemeColors;
  currentTheme: Theme;
  setTheme: (theme: Theme) => void;
  allThemes: Theme[];
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return value;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [currentTheme, setCurrentTheme] = useState(getInitialTheme);

  const setTheme = useCallback((theme: Theme) => {
    setCurrentTheme(theme);
    persistTheme(theme);
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        colors: currentTheme.colors,
        currentTheme,
        setTheme,
        allThemes: THEMES,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
