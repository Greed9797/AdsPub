"use client";

import { useEffect, useState } from 'react';

/** TOGGLE TEMA: dark (padrão) e light do paper. Persiste sem flash (ver script no layout). */
export function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  }, []);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('adpub-theme', next);
    } catch {
      /* privado: segue sem persistir */
    }
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-[var(--color-border)] text-sm"
    >
      <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
    </button>
  );
}
