import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ThemeId, Scope } from './themes';

export type ThemeSettings = {
  global: ThemeId;
  /** Override per zona; se null/undefined eredita da global */
  editor: ThemeId | null;
  center: ThemeId | null;
  sidebar: ThemeId | null;
  terminal: ThemeId | null;
};

type ThemeStore = ThemeSettings & {
  setGlobal: (id: ThemeId) => void;
  setScope: (scope: Exclude<Scope, 'global'>, id: ThemeId | null) => void;
  resetAll: () => void;
};

const DEFAULT: ThemeSettings = {
  global: 'monokai',
  editor: null,
  center: null,
  sidebar: null,
  terminal: null,
};

export const useTheme = create<ThemeStore>()(
  persist(
    (set) => ({
      ...DEFAULT,
      setGlobal: (id) => set({ global: id }),
      setScope: (scope, id) => set({ [scope]: id } as Partial<ThemeStore>),
      resetAll: () => set({ ...DEFAULT }),
    }),
    { name: 'sublodex.theme' },
  ),
);

/** Risolve il tema effettivo per una zona, con fallback al global. */
export function resolveTheme(t: ThemeSettings, scope: Exclude<Scope, 'global'>): ThemeId {
  return (t[scope] ?? null) ?? t.global;
}
