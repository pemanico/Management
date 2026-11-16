// Tema da interface: segue o sistema por omissão; a escolha fica guardada no browser.
export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];
const KEY = 'gu:theme';

export function readTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  try {
    if (theme === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // Sem armazenamento: o tema vale só para esta visita.
  }
}
