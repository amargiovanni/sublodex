/**
 * Catalogo temi. Ogni tema definisce:
 *  - vars CSS (per UI)
 *  - colors Monaco (editor)
 *  - colors xterm (terminal)
 *  - syntax highlight Prism (markdown code blocks)
 */

export type ThemeId =
  | 'monokai' | 'dracula' | 'nord' | 'tokyonight'
  | 'github-light' | 'solarized-dark' | 'one-dark';

export type Scope = 'global' | 'editor' | 'center' | 'sidebar' | 'terminal';

export type ThemeColors = {
  /** UI vars */
  bg: string;
  bgElev: string;
  bgCard: string;
  bgCard2: string;
  bgDeep: string;
  border: string;
  borderStrong: string;
  fg: string;
  fgDim: string;
  fgMute: string;
  accent: string;
  accent2: string;
  green: string;
  red: string;
  yellow: string;
  blue: string;
  purple: string;

  /** Monaco editor */
  monacoBase: 'vs-dark' | 'vs';

  /** xterm 16-color ANSI */
  ansi: {
    black: string; red: string; green: string; yellow: string;
    blue: string; magenta: string; cyan: string; white: string;
    brightBlack: string; brightRed: string; brightGreen: string; brightYellow: string;
    brightBlue: string; brightMagenta: string; brightCyan: string; brightWhite: string;
  };
};

export type Theme = {
  id: ThemeId;
  label: string;
  isDark: boolean;
  colors: ThemeColors;
};

const monokai: Theme = {
  id: 'monokai', label: 'Monokai', isDark: true,
  colors: {
    bg: '#272822', bgElev: '#2D2E27', bgCard: '#3E3D32', bgCard2: '#49483E', bgDeep: '#1E1F1A',
    border: '#3E3D32', borderStrong: '#75715E',
    fg: '#F8F8F2', fgDim: '#CFCFC2', fgMute: '#75715E',
    accent: '#FD971F', accent2: '#F92672',
    green: '#A6E22E', red: '#F92672', yellow: '#E6DB74', blue: '#66D9EF', purple: '#AE81FF',
    monacoBase: 'vs-dark',
    ansi: {
      black: '#272822', red: '#F92672', green: '#A6E22E', yellow: '#E6DB74',
      blue: '#66D9EF', magenta: '#AE81FF', cyan: '#A1EFE4', white: '#F8F8F2',
      brightBlack: '#75715E', brightRed: '#F92672', brightGreen: '#A6E22E', brightYellow: '#FD971F',
      brightBlue: '#66D9EF', brightMagenta: '#AE81FF', brightCyan: '#A1EFE4', brightWhite: '#F9F8F5',
    },
  },
};

const dracula: Theme = {
  id: 'dracula', label: 'Dracula', isDark: true,
  colors: {
    bg: '#282A36', bgElev: '#21222C', bgCard: '#44475A', bgCard2: '#4D5066', bgDeep: '#191A21',
    border: '#44475A', borderStrong: '#6272A4',
    fg: '#F8F8F2', fgDim: '#D6D7DC', fgMute: '#6272A4',
    accent: '#FF79C6', accent2: '#BD93F9',
    green: '#50FA7B', red: '#FF5555', yellow: '#F1FA8C', blue: '#8BE9FD', purple: '#BD93F9',
    monacoBase: 'vs-dark',
    ansi: {
      black: '#282A36', red: '#FF5555', green: '#50FA7B', yellow: '#F1FA8C',
      blue: '#BD93F9', magenta: '#FF79C6', cyan: '#8BE9FD', white: '#F8F8F2',
      brightBlack: '#6272A4', brightRed: '#FF6E6E', brightGreen: '#69FF94', brightYellow: '#FFFFA5',
      brightBlue: '#D6ACFF', brightMagenta: '#FF92DF', brightCyan: '#A4FFFF', brightWhite: '#FFFFFF',
    },
  },
};

const nord: Theme = {
  id: 'nord', label: 'Nord', isDark: true,
  colors: {
    bg: '#2E3440', bgElev: '#272B35', bgCard: '#3B4252', bgCard2: '#434C5E', bgDeep: '#1F242C',
    border: '#3B4252', borderStrong: '#4C566A',
    fg: '#ECEFF4', fgDim: '#D8DEE9', fgMute: '#7A8295',
    accent: '#88C0D0', accent2: '#B48EAD',
    green: '#A3BE8C', red: '#BF616A', yellow: '#EBCB8B', blue: '#81A1C1', purple: '#B48EAD',
    monacoBase: 'vs-dark',
    ansi: {
      black: '#3B4252', red: '#BF616A', green: '#A3BE8C', yellow: '#EBCB8B',
      blue: '#81A1C1', magenta: '#B48EAD', cyan: '#88C0D0', white: '#E5E9F0',
      brightBlack: '#4C566A', brightRed: '#BF616A', brightGreen: '#A3BE8C', brightYellow: '#EBCB8B',
      brightBlue: '#81A1C1', brightMagenta: '#B48EAD', brightCyan: '#8FBCBB', brightWhite: '#ECEFF4',
    },
  },
};

const tokyonight: Theme = {
  id: 'tokyonight', label: 'Tokyo Night', isDark: true,
  colors: {
    bg: '#1A1B26', bgElev: '#16161E', bgCard: '#24283B', bgCard2: '#2F3549', bgDeep: '#0D0E14',
    border: '#24283B', borderStrong: '#414868',
    fg: '#C0CAF5', fgDim: '#A9B1D6', fgMute: '#565F89',
    accent: '#7AA2F7', accent2: '#BB9AF7',
    green: '#9ECE6A', red: '#F7768E', yellow: '#E0AF68', blue: '#7AA2F7', purple: '#BB9AF7',
    monacoBase: 'vs-dark',
    ansi: {
      black: '#15161E', red: '#F7768E', green: '#9ECE6A', yellow: '#E0AF68',
      blue: '#7AA2F7', magenta: '#BB9AF7', cyan: '#7DCFFF', white: '#A9B1D6',
      brightBlack: '#414868', brightRed: '#F7768E', brightGreen: '#9ECE6A', brightYellow: '#E0AF68',
      brightBlue: '#7AA2F7', brightMagenta: '#BB9AF7', brightCyan: '#7DCFFF', brightWhite: '#C0CAF5',
    },
  },
};

const oneDark: Theme = {
  id: 'one-dark', label: 'One Dark', isDark: true,
  colors: {
    bg: '#282C34', bgElev: '#21252B', bgCard: '#2C313A', bgCard2: '#3E4451', bgDeep: '#181A1F',
    border: '#3E4451', borderStrong: '#5C6370',
    fg: '#ABB2BF', fgDim: '#B5BBC8', fgMute: '#5C6370',
    accent: '#61AFEF', accent2: '#C678DD',
    green: '#98C379', red: '#E06C75', yellow: '#E5C07B', blue: '#61AFEF', purple: '#C678DD',
    monacoBase: 'vs-dark',
    ansi: {
      black: '#282C34', red: '#E06C75', green: '#98C379', yellow: '#E5C07B',
      blue: '#61AFEF', magenta: '#C678DD', cyan: '#56B6C2', white: '#ABB2BF',
      brightBlack: '#5C6370', brightRed: '#E06C75', brightGreen: '#98C379', brightYellow: '#E5C07B',
      brightBlue: '#61AFEF', brightMagenta: '#C678DD', brightCyan: '#56B6C2', brightWhite: '#FFFFFF',
    },
  },
};

const solarizedDark: Theme = {
  id: 'solarized-dark', label: 'Solarized Dark', isDark: true,
  colors: {
    bg: '#002B36', bgElev: '#03303C', bgCard: '#073642', bgCard2: '#0C4451', bgDeep: '#001E24',
    border: '#073642', borderStrong: '#586E75',
    fg: '#FDF6E3', fgDim: '#EEE8D5', fgMute: '#839496',
    accent: '#B58900', accent2: '#CB4B16',
    green: '#859900', red: '#DC322F', yellow: '#B58900', blue: '#268BD2', purple: '#6C71C4',
    monacoBase: 'vs-dark',
    ansi: {
      black: '#073642', red: '#DC322F', green: '#859900', yellow: '#B58900',
      blue: '#268BD2', magenta: '#D33682', cyan: '#2AA198', white: '#EEE8D5',
      brightBlack: '#586E75', brightRed: '#CB4B16', brightGreen: '#586E75', brightYellow: '#657B83',
      brightBlue: '#839496', brightMagenta: '#6C71C4', brightCyan: '#93A1A1', brightWhite: '#FDF6E3',
    },
  },
};

const githubLight: Theme = {
  id: 'github-light', label: 'GitHub Light', isDark: false,
  colors: {
    bg: '#FFFFFF', bgElev: '#F6F8FA', bgCard: '#EAEEF2', bgCard2: '#DDE2E8', bgDeep: '#EFF2F5',
    border: '#D0D7DE', borderStrong: '#8C959F',
    fg: '#1F2328', fgDim: '#3B3F45', fgMute: '#6E7781',
    accent: '#FB8500', accent2: '#CF222E',
    green: '#1A7F37', red: '#CF222E', yellow: '#9A6700', blue: '#0969DA', purple: '#8250DF',
    monacoBase: 'vs',
    ansi: {
      black: '#24292F', red: '#CF222E', green: '#1A7F37', yellow: '#9A6700',
      blue: '#0969DA', magenta: '#8250DF', cyan: '#1B7C83', white: '#6E7781',
      brightBlack: '#57606A', brightRed: '#A40E26', brightGreen: '#116329', brightYellow: '#4D2D00',
      brightBlue: '#0550AE', brightMagenta: '#6639BA', brightCyan: '#3192AA', brightWhite: '#8C959F',
    },
  },
};

export const THEMES: Record<ThemeId, Theme> = {
  monokai, dracula, nord, tokyonight, 'one-dark': oneDark,
  'solarized-dark': solarizedDark, 'github-light': githubLight,
};

export const THEME_LIST: Theme[] = [
  monokai, dracula, tokyonight, 'one-dark' as any, nord, solarizedDark, githubLight,
].map((x) => typeof x === 'string' ? THEMES[x] : x);

export function themeVarsCss(c: ThemeColors): Record<string, string> {
  return {
    '--bg':            c.bg,
    '--bg-elev':       c.bgElev,
    '--bg-card':       c.bgCard,
    '--bg-card-2':     c.bgCard2,
    '--bg-deep':       c.bgDeep,
    '--border':        c.border,
    '--border-strong': c.borderStrong,
    '--fg':            c.fg,
    '--fg-dim':        c.fgDim,
    '--fg-mute':       c.fgMute,
    '--accent':        c.accent,
    '--accent-2':      c.accent2,
    '--green':         c.green,
    '--green-dim':     hexAlpha(c.green, 0.12),
    '--green-strong':  hexAlpha(c.green, 0.22),
    '--red':           c.red,
    '--red-dim':       hexAlpha(c.red, 0.12),
    '--red-strong':    hexAlpha(c.red, 0.22),
    '--yellow':        c.yellow,
    '--yellow-dim':    hexAlpha(c.yellow, 0.14),
    '--blue':          c.blue,
    '--blue-dim':      hexAlpha(c.blue, 0.14),
    '--purple':        c.purple,
    '--purple-dim':    hexAlpha(c.purple, 0.14),
  };
}

function hexAlpha(hex: string, alpha: number): string {
  const m = hex.replace('#', '');
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
