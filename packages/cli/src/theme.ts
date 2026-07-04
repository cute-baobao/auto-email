export type ThemeColors = {
  primary: string;
  planMode: string;
  selection: string;
  thinking: string;
  success: string;
  error: string;
  info: string;
  background: string;
  surface: string;
  dialogSurface: string;
  thinkingBorder: string;
  dimSeparator: string;
};

export type Theme = {
  name: string;
  colors: ThemeColors;
};

export const THEMES: Theme[] = [
  {
    name: 'Nightfox',
    colors: {
      primary: '#56D6C2',
      planMode: '#CF8EF4',
      selection: '#89B4FA',
      thinking: '#CF8EF4',
      success: '#82E0AA',
      error: '#E74C5E',
      info: '#56D6C2',
      background: '#0D0D12',
      surface: '#1A1A24',
      dialogSurface: '#0A0A10',
      thinkingBorder: '#34344A',
      dimSeparator: '#4E4E66',
    },
  },
  {
    name: 'Catppuccin Mocha',
    colors: {
      primary: '#E0AF68',
      planMode: '#9D7CD8',
      selection: '#B4A4E8',
      thinking: '#9D7CD8',
      success: '#73DACA',
      error: '#F7768E',
      info: '#7AA2F7',
      background: '#11111B',
      surface: '#1E1E2E',
      dialogSurface: '#13131D',
      thinkingBorder: '#45475A',
      dimSeparator: '#585B70',
    },
  },
  {
    name: 'Dracula',
    colors: {
      primary: '#BD93F9',
      planMode: '#FF79C6',
      selection: '#6272A4',
      thinking: '#FF79C6',
      success: '#50FA7B',
      error: '#FF5555',
      info: '#8BE9FD',
      background: '#282A36',
      surface: '#343746',
      dialogSurface: '#21222C',
      thinkingBorder: '#6272A4',
      dimSeparator: '#44475A',
    },
  },
  {
    name: 'Monokai Pro',
    colors: {
      primary: '#FFD866',
      planMode: '#AB9DF2',
      selection: '#AB9DF2',
      thinking: '#AB9DF2',
      success: '#A9DC76',
      error: '#FF6188',
      info: '#78DCE8',
      background: '#2D2A2E',
      surface: '#403E41',
      dialogSurface: '#221F22',
      thinkingBorder: '#5B5353',
      dimSeparator: '#727072',
    },
  },
];

export const DEFAULT_THEME = THEMES[0]!;
