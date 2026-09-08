/** R14: UTM vai em `url_tags`, nunca na URL, para não quebrar o link. */

export function parseUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url;
  } catch {
    return null;
  }
}

export function isAllowedDomain(raw: string, domains: readonly string[]): boolean {
  if (domains.length === 0) return true;
  const url = parseUrl(raw);
  if (!url) return false;
  const host = url.hostname.toLowerCase();
  return domains.some((d) => {
    const domain = d.trim().toLowerCase().replace(/^\.+/, '');
    if (!domain) return false;
    return host === domain || host.endsWith(`.${domain}`);
  });
}

export function displayLinkFor(raw: string): string {
  const url = parseUrl(raw);
  return url ? url.hostname.replace(/^www\./, '') : '';
}

const PROTECT = /\{\{[^}]+\}\}/g;
const TOKEN = /\{([a-zA-Z_]+)\}/g;

/** Substitui `{token}` preservando macros da Meta como `{{site_source_name}}`. */
export function interpolateTokens(value: string, tokens: Record<string, string>): string {
  const protected_: string[] = [];
  // Sentinela em área de uso privado: nunca aparece em URL nem em UTM real.
  const masked = value.replace(PROTECT, (m) => {
    protected_.push(m);
    return `\uE000${protected_.length - 1}\uE000`;
  });
  const substituted = masked.replace(TOKEN, (_all, name: string) => tokens[name.toLowerCase()] ?? '');
  return substituted.replace(/\uE000(\d+)\uE000/g, (_all, index: string) =>
    protected_[Number(index)] ?? '',
  );
}

/** Monta `url_tags` a partir do UTM padrão do cliente. */
export function buildUrlTags(
  defaultUtm: Record<string, string>,
  tokens: Record<string, string> = {},
): string {
  const parts: string[] = [];
  for (const [key, rawValue] of Object.entries(defaultUtm)) {
    if (!key) continue;
    const value = interpolateTokens(String(rawValue ?? ''), tokens).trim();
    if (!value) continue;
    parts.push(`${key}=${value}`);
  }
  return parts.join('&');
}

export function parseUrlTags(urlTags: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of urlTags.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    out[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return out;
}

/** Garante que todos os parâmetros padrão existam, sem sobrescrever os manuais. */
export function mergeUrlTags(existing: string, defaults: string): string {
  const current = parseUrlTags(existing);
  const wanted = parseUrlTags(defaults);
  const merged = { ...wanted, ...current };
  return Object.entries(merged)
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
}

export function missingUtmKeys(existing: string, defaults: Record<string, string>): string[] {
  const current = parseUrlTags(existing);
  return Object.keys(defaults).filter((k) => !(k in current));
}
