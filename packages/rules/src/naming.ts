/** FR-011 / R14: nomenclatura por template com tokens. */

export interface NameTokens {
  cliente?: string;
  conta?: string;
  objetivo?: string;
  criativo?: string;
  formato?: string;
  v?: number | string;
  data?: Date;
  [key: string]: string | number | Date | undefined;
}

const DATE_FORMATS: Record<string, (d: Date) => string> = {
  YYYYMMDD: (d) => `${yyyy(d)}${mm(d)}${dd(d)}`,
  'YYYY-MM-DD': (d) => `${yyyy(d)}-${mm(d)}-${dd(d)}`,
  DDMMYYYY: (d) => `${dd(d)}${mm(d)}${yyyy(d)}`,
  YYMMDD: (d) => `${yyyy(d).slice(2)}${mm(d)}${dd(d)}`,
};

const yyyy = (d: Date) => String(d.getUTCFullYear());
const mm = (d: Date) => String(d.getUTCMonth() + 1).padStart(2, '0');
const dd = (d: Date) => String(d.getUTCDate()).padStart(2, '0');

const TOKEN_RE = /\{([a-zA-Z_]+)(?::([A-Za-z-]+))?\}/g;

/** Normaliza um valor de token: sem acento, sem separador do template. */
export function slugToken(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

export function renderNamingTemplate(template: string, tokens: NameTokens): string {
  const date = tokens.data instanceof Date ? tokens.data : new Date();
  const rendered = template.replace(TOKEN_RE, (_all, rawName: string, format?: string) => {
    const name = rawName.toLowerCase();
    if (name === 'data') {
      const fmt = format && DATE_FORMATS[format] ? format : 'YYYYMMDD';
      return (DATE_FORMATS[fmt] as (d: Date) => string)(date);
    }
    const value = tokens[name] ?? tokens[rawName];
    if (value === undefined || value === null || value === '') return '';
    if (value instanceof Date) return DATE_FORMATS.YYYYMMDD!(value);
    if (typeof value === 'number') return String(value);
    return slugToken(value);
  });
  return rendered
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .trim();
}

/** Converte o template em regex para checar se um nome segue o padrão. */
export function namingTemplateRegex(template: string): RegExp {
  let pattern = '';
  let lastIndex = 0;
  for (const match of template.matchAll(TOKEN_RE)) {
    const index = match.index ?? 0;
    pattern += escapeRegex(template.slice(lastIndex, index));
    const name = (match[1] ?? '').toLowerCase();
    const format = match[2];
    if (name === 'data') {
      const fmt = format && DATE_FORMATS[format] ? format : 'YYYYMMDD';
      pattern += fmt === 'YYYY-MM-DD' ? '\\d{4}-\\d{2}-\\d{2}' : `\\d{${fmt.length}}`;
    } else if (name === 'v') {
      pattern += '\\d+';
    } else {
      pattern += '[^_]+';
    }
    lastIndex = index + match[0].length;
  }
  pattern += escapeRegex(template.slice(lastIndex));
  return new RegExp(`^${pattern}$`);
}

export function matchesNamingTemplate(name: string, template: string): boolean {
  return namingTemplateRegex(template).test(name);
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
