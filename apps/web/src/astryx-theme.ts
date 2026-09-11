import { defineTheme } from '@astryxdesign/core/theme';
import { gothicTheme } from '@astryxdesign/theme-gothic/built';

/**
 * Tema AdPub: gothic (dark-only) + brand laranja W3.
 * Texto sobre accent usa ink (contraste AA); tipografia segue a direção
 * aprovada (Geist corpo, Oswald condensada em títulos/KPIs).
 */
export const adpubTheme = defineTheme({
  name: 'adpub',
  extends: gothicTheme,
  typography: {
    body: {
      family: 'Geist',
      fallbacks: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
    heading: {
      family: 'Oswald',
      fallbacks: 'Arial Narrow, sans-serif',
    },
    code: {
      family: 'Geist Mono',
      fallbacks: 'ui-monospace, "SFMono-Regular", Menlo, monospace',
    },
  },
  tokens: {
    '--color-accent': '#ff5701',
    '--color-accent-muted': '#ff570120',
    '--color-text-accent': '#ff5701',
    '--color-icon-accent': '#ff5701',
    '--color-on-accent': '#1a1005',
  },
});
