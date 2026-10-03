'use client';

import { Icon } from '../icons';
import { useThemePreference } from '../providers';

const OPCOES = [
  ['light', 'sun', 'Claro'],
  ['dark', 'moon', 'Escuro'],
  ['system', 'display', 'Sistema'],
] as const;

/** Claro, Escuro ou Sistema. Grava o cookie `adpub_theme` pelo provedor. */
export function ThemeSwitch() {
  const { mode, setMode } = useThemePreference();
  return (
    <div className="ap-theme" role="group" aria-label="Tema">
      {OPCOES.map(([value, icon, label]) => (
        <button
          key={value}
          type="button"
          className="ap-theme__btn"
          aria-pressed={mode === value}
          aria-label={label}
          title={label}
          onClick={() => setMode(value)}
        >
          <Icon name={icon} size={14} />
        </button>
      ))}
    </div>
  );
}
