import { defineTheme } from '@astryxdesign/core/theme';

export type ThemeMode = 'light' | 'dark' | 'system';

/** Linear product grammar + AdPub orange. Geist stands in for Inter. */
export const adpubTheme = defineTheme({
  name: 'adpub',
  color: { accent: '#ff5701', neutralStyle: 'cool' },
  typography: {
    scale: { base: 13, ratio: 1.15 },
    body: {
      family: 'Geist',
      fallbacks: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
    heading: {
      family: 'Geist',
      fallbacks: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
    code: { family: 'Geist Mono', fallbacks: 'ui-monospace, Menlo, monospace' },
  },
  radius: { base: 4, multiplier: 1 },
  tokens: {
    '--color-background-body': ['#f7f7f8', '#0f0f11'],
    '--color-background-surface': ['#ffffff', '#18181b'],
    '--color-background-card': ['#ffffff', '#18181b'],
    '--color-background-popover': ['#ffffff', '#18181b'],
    '--color-background-muted': ['#f3f3f5', '#222226'],
    '--color-text-primary': ['#1b1b1f', '#f4f4f5'],
    '--color-text-secondary': ['#5c5e66', '#a1a1aa'],
    '--color-icon-primary': ['#5c5e66', '#d4d4d8'],
    '--color-icon-secondary': ['#71717a', '#a1a1aa'],
    '--color-border': ['#e4e4e7', '#2c2c32'],
    '--color-border-emphasized': ['#a1a1aa', '#52525b'],
    '--color-accent': '#ff5701',
    '--color-accent-muted': ['#fff1ea', '#3a241c'],
    '--color-text-accent': ['#c94100', '#ff9d70'],
    '--color-icon-accent': ['#c94100', '#ff9d70'],
    '--color-on-accent': '#1a1005',
    '--color-success': ['#187044', '#73d9a4'],
    '--color-on-success': '#ffffff',
    '--color-warning': ['#8a5800', '#f7cb73'],
    '--color-on-warning': '#ffffff',
    '--color-error': ['#bc2637', '#ff929b'],
    '--color-on-error': '#ffffff',
    '--radius-element': '6px',
    '--radius-container': '8px',
    '--radius-page': '0px',
  },
  components: {
    button: { base: { borderRadius: '6px', fontWeight: '600' } },
    card: { base: { borderRadius: '8px' } },
  },
});
