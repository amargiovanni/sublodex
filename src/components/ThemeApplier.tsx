import { useEffect } from 'react';
import { useTheme, resolveTheme } from '../lib/themeStore';
import { THEMES, themeVarsCss } from '../lib/themes';
import type { Scope } from '../lib/themes';

/**
 * Applica le CSS custom properties del tema risolto sul ref dato.
 * Usato in cima a ogni "zona" della UI: global, sidebar, center, editor, terminal.
 *
 * Implementato come hook + utility per evitare overhead di un componente wrapper.
 */
export function useScopedTheme(
  ref: React.RefObject<HTMLElement | null>,
  scope: Scope,
) {
  const t = useTheme();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const id = scope === 'global' ? t.global : resolveTheme(t, scope);
    const theme = THEMES[id];
    const vars = themeVarsCss(theme.colors);
    for (const [k, v] of Object.entries(vars)) {
      el.style.setProperty(k, v);
    }
    el.dataset.theme = id;
    el.dataset.themeMode = theme.isDark ? 'dark' : 'light';
  }, [ref, scope, t.global, t.editor, t.center, t.sidebar, t.terminal]);
}
