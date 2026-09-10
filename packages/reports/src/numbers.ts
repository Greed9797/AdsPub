/**
 * T-003-1: escalares de relatório. Vazio = ausente (`null`), nunca zero.
 * Inválido = `null` + motivo na linha, nunca chute.
 */

/** "R$ 1.234,56" → 1234.56 · "1234.56" → 1234.56 · "" → null. */
export function parseDecimal(raw: string): number | null {
  let text = raw.trim();
  if (!text) return null;
  text = text.replace(/^[^\d\-+.,]+/, '').replace(/[^\d\-+.,]+$/, '');
  if (!text || !/[\d]/.test(text)) return null;
  const hasComma = text.includes(',');
  const hasDot = text.includes('.');
  let normalized: string;
  if (hasComma && hasDot) {
    // BR: milhar `.`, decimal `,` — quando a vírgula vem por último.
    normalized =
      text.lastIndexOf(',') > text.lastIndexOf('.')
        ? text.replace(/\./g, '').replace(',', '.')
        : text.replace(/,/g, '');
  } else if (hasComma) {
    normalized = text.replace(',', '.');
  } else {
    normalized = text;
  }
  if (!/^[-+]?(\d+(\.\d+)?|\.\d+)$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/** "31/12/2026" ou "2026-12-31" → "2026-12-31". AMBÍGUO MM/DD não entra. */
export function parseDate(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  let match = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(text);
  if (match) {
    const [, day, month, year] = match as unknown as [string, string, string, string];
    if (validDate(year, month, day)) return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    return null;
  }
  match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (match) {
    const [, year, month, day] = match as unknown as [string, string, string, string];
    if (validDate(year, month, day)) return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return null;
}

function validDate(year: string, month: string, day: string): boolean {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * ID exato de dígitos. Notação científica, decimal ou arredondado = `null`
 * (AC-003-06: nunca vincular por chute).
 */
export function parseAdId(raw: string): string | null {
  const text = raw.trim();
  if (!/^\d{4,}$/.test(text)) return null;
  return text;
}

/** Linha de total misturada ao detalhe: nunca vira observação. */
export function isTotalRow(adName: string): boolean {
  return /^\s*total/i.test(adName);
}
