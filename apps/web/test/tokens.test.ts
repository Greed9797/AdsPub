import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..', 'src');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

/** Cores do Figma "App / Cor (W3 claro)" (RDS-01). */
const FIGMA_LIGHT: Record<string, string> = {
  '--ap-bg-page': '#F3F1EA',
  '--ap-bg-surface': '#FBFAF6',
  '--ap-bg-band': '#F3F1EA',
  '--ap-bg-sunken': '#E8E5DB',
  '--ap-text-1': '#0F0F0D',
  '--ap-text-2': '#3A3935',
  '--ap-text-3': '#65645D',
  '--ap-text-on-dark': '#A9A79E',
  '--ap-line': '#D5D1C4',
  '--ap-line-strong': '#0F0F0D',
  '--ap-orange': '#FF5701',
  '--ap-orange-text': '#C24100',
  '--ap-orange-veil': '#FDF0E6',
  '--ap-error': '#B3261E',
  '--ap-error-veil': '#F4E5E0',
  '--ap-data-published': '#0F0F0D',
  '--ap-data-ready': '#B9B4A4',
  '--ap-data-draft': '#D5D1C4',
  '--ap-data-hatch': '#9D978A',
  '--ap-data-dot': '#D5D1C4',
};

function declaration(css: string, name: string): string | undefined {
  const match = css.match(new RegExp(`${name}\\s*:\\s*([^;]+);`, 'i'));
  return match?.[1].trim();
}

function lightBlock(css: string): string {
  const start = css.indexOf(':root {');
  return css.slice(start, css.indexOf('}', start));
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe('tokens do redesign v2', () => {
  const tokens = read('styles/tokens.css');
  const base = read('styles/base.css');

  it('RDS-01: declara as 20 cores do Figma com o valor exato no tema claro', () => {
    const light = lightBlock(tokens);
    for (const [name, hex] of Object.entries(FIGMA_LIGHT)) {
      expect(declaration(light, name)?.toUpperCase(), name).toBe(hex);
    }
  });

  it('RDS-01: define o tema escuro por data-theme e por prefers-color-scheme no modo sistema', () => {
    expect(tokens).toContain(":root[data-theme='dark']");
    expect(tokens).toMatch(/@media \(prefers-color-scheme: dark\)\s*{\s*:root\[data-theme='system'\]/);
    const dark = tokens.slice(tokens.indexOf(":root[data-theme='dark']"));
    expect(declaration(dark, '--ap-bg-page')?.toUpperCase()).not.toBe(FIGMA_LIGHT['--ap-bg-page']);
    expect(declaration(dark, '--ap-text-1')?.toUpperCase()).not.toBe(FIGMA_LIGHT['--ap-text-1']);
  });

  it('RDS-01: define os raios 6, 12, 16, 24, 28 e pílula', () => {
    const light = lightBlock(tokens);
    const radii = { '--ap-r-sm': '6px', '--ap-r-md': '12px', '--ap-r-lg': '16px', '--ap-r-xl': '24px', '--ap-r-modal': '28px', '--ap-r-pill': '999px' };
    for (const [name, value] of Object.entries(radii)) expect(declaration(light, name), name).toBe(value);
  });

  it('RDS-02: títulos e números grandes em Nunito, texto em Geist e dados em Geist Mono', () => {
    const light = lightBlock(tokens);
    expect(declaration(light, '--ap-font-display')).toContain('Nunito Variable');
    expect(declaration(light, '--ap-font-text')).toContain('--font-geist-sans');
    expect(declaration(light, '--ap-font-mono')).toContain('--font-geist-mono');
    for (const cls of ['ap-t-display', 'ap-t-title', 'ap-t-num-xl']) {
      expect(base, cls).toMatch(new RegExp(`\\.${cls}\\s*{[^}]*--ap-font-display`));
    }
    for (const cls of ['ap-t-label', 'ap-t-num', 'ap-t-ref']) {
      expect(base, cls).toMatch(new RegExp(`\\.${cls}\\s*{[^}]*--ap-font-mono`));
    }
  });

  it('RDS-03: nenhuma fonte é buscada por rede no build', () => {
    const offenders = walk(SRC)
      .filter((file) => /\.(css|ts|tsx)$/.test(file))
      .filter((file) => /fonts\.googleapis|fonts\.gstatic|next\/font\/google/.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('RDS-09: o foco visível usa borda de tinta e anel laranja de 3 px a 35%', () => {
    const rule = base.match(/:focus-visible\s*{[^}]*}/)?.[0] ?? '';
    expect(rule).toContain('outline: 2px solid var(--ap-text-1)');
    expect(rule).toMatch(/box-shadow:\s*0 0 0 5px color-mix\(in srgb, var\(--ap-orange\) 35%, transparent\)/);
  });
});
