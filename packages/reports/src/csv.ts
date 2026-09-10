/** T-003-1: limites anti-abuso para arquivo não confiável (Constituição 10). */
export const REPORT_LIMITS = {
  maxBytes: 10 * 1024 * 1024,
  maxRows: 20_000,
  maxCols: 100,
} as const;

export class ReportParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReportParseError';
  }
}

function decode(bytes: Uint8Array): string {
  const stripBom = (text: string) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  try {
    return stripBom(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return stripBom(new TextDecoder('latin1').decode(bytes));
  }
}

function sniffDelimiter(line: string): ';' | ',' {
  let semis = 0;
  let commas = 0;
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') inQuotes = !inQuotes;
    else if (!inQuotes && char === ';') semis += 1;
    else if (!inQuotes && char === ',') commas += 1;
  }
  return semis >= commas ? ';' : ',';
}

/**
 * CSV determinístico: separador `;` ou `,` farejado fora de aspas, aspas
 * duplas RFC4180, `\n` dentro de aspas. Sem chute de encoding além de
 * utf-8→latin1.
 */
export function parseCsv(bytes: Uint8Array): { headers: string[]; rows: string[][] } {
  if (bytes.length > REPORT_LIMITS.maxBytes) {
    throw new ReportParseError(`Arquivo excede ${REPORT_LIMITS.maxBytes} bytes.`);
  }
  const text = decode(bytes);
  const firstLine = text.split(/\r?\n/).find((line) => line.trim().length > 0) ?? '';
  const delimiter = sniffDelimiter(firstLine);

  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.some((cell) => cell.trim().length > 0)) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  if (inQuotes) throw new ReportParseError('Aspas não fechadas no CSV.');
  row.push(field);
  if (row.some((cell) => cell.trim().length > 0)) rows.push(row);

  const [headerRow, ...data] = rows;
  if (!headerRow || headerRow.every((cell) => cell.trim().length === 0)) {
    throw new ReportParseError('Cabeçalho ausente ou vazio.');
  }
  if (headerRow.length > REPORT_LIMITS.maxCols) {
    throw new ReportParseError(`Colunas excedem ${REPORT_LIMITS.maxCols}.`);
  }
  if (data.length > REPORT_LIMITS.maxRows) {
    throw new ReportParseError(`Linhas excedem ${REPORT_LIMITS.maxRows}.`);
  }
  const headers = headerRow.map((cell) => cell.trim());
  return { headers, rows: data.map((r) => headers.map((_, i) => (r[i] ?? '').trim())) };
}
