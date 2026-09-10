import * as XLSX from 'xlsx';
import { REPORT_LIMITS, ReportParseError, parseCsv } from './csv.js';
import { CANONICAL_COLUMNS, type CanonicalColumn, type MappingProposal } from './mapping.js';
import { isTotalRow, parseAdId, parseDate, parseDecimal } from './numbers.js';

export interface ReportImportContext {
  currency: string;
  timezone: string;
  entityLevel: 'account' | 'campaign' | 'adset' | 'ad';
  attribution: string;
  coverage: 'all' | 'selected' | 'unknown';
}

export interface RowIssue {
  code: string;
  field: string;
  message: string;
}

export interface StagedObservation {
  localRowId: string;
  adId: string | null;
  adName: string;
  dateStart: string;
  dateStop: string;
  grain: 'daily' | 'period';
  metrics: Partial<Record<CanonicalColumn, number | string>>;
}

export interface StagedRow {
  rowNumber: number;
  raw: Record<string, string>;
  observation: StagedObservation | null;
  issues: RowIssue[];
}

const METRIC_COLUMNS: ReadonlySet<CanonicalColumn> = new Set([
  'spend',
  'impressions',
  'link_clicks',
  'outbound_clicks',
  'primary_results',
  'primary_result_value',
  'video_plays',
  'video_thruplay',
  'video_avg_pct',
]);

/** Lê CSV ou XLSX em grade de strings. XLSX usa a 1ª aba ou `sheet`. */
export function readGrid(bytes: Uint8Array, filename: string, sheet?: string): { headers: string[]; rows: string[][] } {
  if (bytes.length > REPORT_LIMITS.maxBytes) {
    throw new ReportParseError(`Arquivo excede ${REPORT_LIMITS.maxBytes} bytes.`);
  }
  if (/\.csv$/i.test(filename)) return parseCsv(bytes);
  if (/\.(xlsx|xls)$/i.test(filename)) {
    const book = XLSX.read(bytes, { type: 'buffer', sheetRows: REPORT_LIMITS.maxRows + 1, bookVBA: false });
    const name = sheet ?? book.SheetNames[0];
    if (!name) throw new ReportParseError('Planilha sem abas.');
    const ws = book.Sheets[name];
    if (!ws) throw new ReportParseError(`Aba "${sheet}" não encontrada.`);
    const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: false });
    const rows = grid
      .map((row) => (Array.isArray(row) ? row : [row]).map((cell) => cellToString(cell)))
      .filter((row) => row.some((cell) => cell.trim().length > 0));
    const [headerRow, ...data] = rows;
    if (!headerRow || headerRow.every((cell) => cell.trim().length === 0)) {
      throw new ReportParseError('Cabeçalho ausente ou vazio.');
    }
    if (data.length > REPORT_LIMITS.maxRows) {
      throw new ReportParseError(`Linhas excedem ${REPORT_LIMITS.maxRows}.`);
    }
    const headers = headerRow.map((cell) => cell.trim());
    return { headers, rows: data.map((r) => headers.map((_, i) => (r[i] ?? '').trim())) };
  }
  throw new ReportParseError('Formato aceito: CSV ou XLSX.');
}

function cellToString(cell: unknown): string {
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'number') {
    // XLSX entrega número: ID vira notação simples — parseAdId decide.
    return Number.isInteger(cell) ? String(cell) : String(cell);
  }
  if (cell instanceof Date) {
    return `${cell.getFullYear()}-${String(cell.getMonth() + 1).padStart(2, '0')}-${String(cell.getDate()).padStart(2, '0')}`;
  }
  return String(cell);
}

/**
 * Normaliza linhas para observações canônicas. Regras duras: total não vira
 * observação; vazio é ausente; consolidado é 1 `period`; ID inexato vira
 * `local_row_id` (AC-003-03/06).
 */
export function stageRows(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
  proposal: Pick<MappingProposal, 'mapping'>,
  rowKeyPrefix: string,
): StagedRow[] {
  return rows.map((cells, index) => {
    const rowNumber = index + 1;
    const raw: Record<string, string> = {};
    headers.forEach((header, i) => {
      raw[header] = cells[i] ?? '';
    });
    const get = (column: CanonicalColumn): string => {
      const header = headers.find((h) => proposal.mapping[h] === column);
      return header ? (raw[header] ?? '') : '';
    };

    const issues: RowIssue[] = [];
    const adName = get('ad_name');
    const adId = parseAdId(get('ad_id'));
    if (get('ad_id').trim() && !adId) {
      issues.push({ code: 'id.inexact', field: 'ad_id', message: 'ID inexato (notação/arredondado): sem vínculo Meta.' });
    }
    if (isTotalRow(adName)) {
      issues.push({ code: 'row.total', field: 'ad_name', message: 'Linha de total: excluída, não é observação.' });
      return { rowNumber, raw, observation: null, issues };
    }

    const dateStart = parseDate(get('date_start'));
    const dateStop = parseDate(get('date_stop'));
    if (!dateStart || !dateStop) {
      issues.push({ code: 'row.missing_period', field: 'date_start/date_stop', message: 'Período ausente ou inválido.' });
      return { rowNumber, raw, observation: null, issues };
    }

    const metrics: StagedObservation['metrics'] = {};
    for (const column of CANONICAL_COLUMNS) {
      if (!METRIC_COLUMNS.has(column)) continue;
      const cell = get(column);
      if (!cell.trim()) continue;
      const value = parseDecimal(cell);
      if (value === null) {
        issues.push({ code: 'metric.invalid', field: column, message: `Valor inválido: "${cell}".` });
        continue;
      }
      metrics[column] = value;
    }
    const eventType = get('primary_event_type').trim();
    if (eventType) metrics.primary_event_type = eventType;

    return {
      rowNumber,
      raw,
      observation: {
        localRowId: `${rowKeyPrefix}:r${rowNumber}`,
        adId,
        adName,
        dateStart,
        dateStop,
        grain: dateStart === dateStop ? 'daily' : 'period',
        metrics,
      },
      issues,
    };
  });
}
