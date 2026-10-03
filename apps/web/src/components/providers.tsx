'use client';

import { createContext, useContext, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';

const ThemePreference = createContext<{
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
} | null>(null);

export function useThemePreference() {
  const preference = useContext(ThemePreference);
  if (!preference) throw new Error('ThemePreference requires Providers.');
  return preference;
}

export function Providers({
  children,
  initialMode,
}: {
  children: React.ReactNode;
  initialMode: ThemeMode;
}) {
  const [mode, setThemeMode] = useState<ThemeMode>(initialMode);

  function setMode(nextMode: ThemeMode) {
    setThemeMode(nextMode);
    document.documentElement.dataset.theme = nextMode;
    document.cookie = `adpub_theme=${nextMode}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  }

  return <ThemePreference.Provider value={{ mode, setMode }}>{children}</ThemePreference.Provider>;
}
