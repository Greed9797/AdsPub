import { defineTheme } from '@astryxdesign/core/theme';

export type ThemeMode = 'light' | 'dark' | 'system';

/** Meta commerce geometry + neutrals; accent stays AdPub orange (#ff5701).
 * Deviations from DESIGN.md (documented, intentional):
 * - Optimistic VF unavailable offline → Geist (same humanist-geometric role).
 * - Body base 14px kept: Ads-Manager density is functional, not decorative.
 * - No published Meta dark tokens (Known Gaps) → current dark ramp retained.
 * - Focus/checkbox activation stays orange: brand owns selection here. */
export const adpubTheme = defineTheme({
  name: 'adpub',
  color: { accent: '#ff5701', neutralStyle: 'cool' },
  typography: {
    scale: { base: 14, ratio: 1.15 },
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
    '--color-background-body': ['#f1f4f7', '#17191c'],
    '--color-background-surface': ['#ffffff', '#22252a'],
    '--color-background-card': ['#ffffff', '#22252a'],
    '--color-background-popover': ['#ffffff', '#22252a'],
    '--color-background-muted': ['#f1f4f7', '#2b2e34'],
    '--color-text-primary': ['#1c1e21', '#f0f2f5'],
    '--color-text-secondary': ['#444950', '#b0b6bf'],
    '--color-icon-primary': ['#444950', '#d8dce3'],
    '--color-icon-secondary': ['#5d6c7b', '#b0b6bf'],
    '--color-border': ['#ced0d4', '#41464f'],
    '--color-border-emphasized': ['#89919d', '#79828e'],
    '--color-accent': '#ff5701',
    '--color-accent-muted': ['#fff0e8', '#3e2b23'],
    '--color-text-accent': ['#a93900', '#ff986b'],
    '--color-icon-accent': ['#a93900', '#ff986b'],
    '--color-on-accent': '#1a1005',
    '--color-success': ['#31a24c', '#4ade80'],
    '--color-on-success': '#ffffff',
    '--color-warning': ['#f7b928', '#f7b928'],
    '--color-on-warning': '#0a1317',
    '--color-error': ['#e41e3f', '#f0284a'],
    '--color-on-error': '#ffffff',
    '--radius-element': '8px',
    '--radius-container': '24px',
    '--radius-page': '0px',
  },
  components: {
    button: { base: { borderRadius: '100px', fontWeight: '700' } },
    card: { base: { borderRadius: '24px' } },
  },
});
