import {
  audit,
  countObservations,
  createReportImport,
  findCommittedImport,
  getReportImport,
  insertObservations,
  listImportRows,
  markImportCommitted,
  replaceImportRows,
  setImportMapping,
  sha256Hex,
  type ReportImportRow,
} from '@adpub/db';
import {
  CANONICAL_COLUMNS,
  MAPPING_VERSION,
  readGrid,
  stageRows,
  suggestMapping,
  type CanonicalColumn,
  type ReportImportContext,
} from '@adpub/reports';
import type { SessionUser } from '@adpub/shared';
import { conflict, notFound, unprocessable } from '../lib/problem.js';
import type { ApiDeps } from '../lib/deps.js';

export interface ImportPreview {
  import_id: string;
  status: string;
  mapping: Record<string, string | null>;
  mapping_version: string;
  unmapped: string[];
  valid: number;
  invalid: number;
  rows: Array<{
    row_number: number;
    status: string;
    errors: Array<{ code: string; field: string; message: string }>;
    observation: unknown | null;
  }>;
}

function safeName(filename: string): string {
  const base = filename.split('/').pop()?.split('\\').pop() ?? 'relatorio';
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'relatorio';
}

async function stage(
  deps: ApiDeps,
  row: ReportImportRow,
  mapping: Record<string, CanonicalColumn | null>,
): Promise<ImportPreview> {
  const bytes = await deps.storage.get(row.storageKey);
  const { headers, rows } = readGrid(bytes, row.filename);
  const staged = stageRows(headers, rows, { mapping }, row.sha256.slice(0, 8));
  await replaceImportRows(
    deps.db,
    row.id,
    staged.map((s) => ({
      rowNumber: s.rowNumber,
      raw: s.raw,
      mapped: s.observation,
      status: s.observation ? 'valid' : 'invalid',
      errors: s.issues,
    })),
  );
  const unmapped = headers.filter((h) => !(mapping[h] ?? null));
  return {
    import_id: row.id,
    status: row.status,
    mapping,
    mapping_version: row.mappingVersion,
    unmapped,
    valid: staged.filter((s) => s.observation).length,
    invalid: staged.filter((s) => !s.observation).length,
    rows: staged.map((s) => ({
      row_number: s.rowNumber,
      status: s.observation ? 'valid' : 'invalid',
      errors: s.issues,
      observation: s.observation,
    })),
  };
}

/** T-003-2: upload + staging inicial com mapeamento sugerido. */
export async function uploadReport(
  deps: ApiDeps,
  actor: SessionUser,
  input: {
    clientId: string;
    adAccountId?: string | null;
    filename: string;
    mime: string;
    bytes: Uint8Array;
    context: ReportImportContext;
    sheet?: string;
  },
): Promise<ImportPreview> {
  // Valida formato antes de guardar: malformado falha aqui, não vira staging.
  const { headers } = readGrid(input.bytes, input.filename, input.sheet);
  const proposal = suggestMapping(headers);
  const sha256 = sha256Hex(input.bytes);
  const storageKey = `reports/${input.clientId}/${sha256}/${safeName(input.filename)}`;
  await deps.storage.put(storageKey, input.bytes, input.mime);
  const row = await createReportImport(deps.db, {
    clientId: input.clientId,
    adAccountId: input.adAccountId ?? null,
    filename: safeName(input.filename),
    mime: input.mime,
    sizeBytes: input.bytes.length,
    sha256,
    storageKey,
    context: input.context,
    mapping: proposal.mapping as Record<string, string | null>,
    mappingVersion: proposal.version,
    createdBy: actor.id,
  });
  await audit(deps.db, {
    actor: { id: actor.id, email: actor.email },
    action: 'report_import.upload',
    entityType: 'report_import',
    entityId: row.id,
    after: { filename: row.filename, sha256, headers: headers.length },
  });
  return stage(deps, row, proposal.mapping);
}

/** T-003-2: ajuste manual do mapeamento + nova prévia (nada publica sem validar). */
export async function remapReport(
  deps: ApiDeps,
  actor: SessionUser,
  importId: string,
  mapping: Record<string, string | null>,
): Promise<ImportPreview> {
  const row = await getReportImport(deps.db, importId);
  if (!row) throw notFound(`Importação ${importId} não encontrada.`);
  if (row.status === 'committed') throw unprocessable('Importação já confirmada — mapping travado.');
  for (const [header, canonical] of Object.entries(mapping)) {
    if (canonical === null) continue;
    if (!isCanonical(canonical)) throw unprocessable(`Coluna canônica inválida: ${canonical} (origem ${header}).`);
  }
  await setImportMapping(deps.db, importId, mapping, MAPPING_VERSION);
  await audit(deps.db, {
    actor: { id: actor.id, email: actor.email },
    action: 'report_import.remap',
    entityType: 'report_import',
    entityId: importId,
  });
  const fresh = (await getReportImport(deps.db, importId)) ?? row;
  return stage(deps, fresh, mapping as Record<string, CanonicalColumn | null>);
}

function isCanonical(value: string): value is CanonicalColumn {
  return (CANONICAL_COLUMNS as readonly string[]).includes(value);
}

/** T-003-2: confirmação idempotente — mesmo conteúdo+mapeamento = 409. */
export async function commitReport(
  deps: ApiDeps,
  actor: SessionUser,
  importId: string,
): Promise<{ observations: number }> {
  const row = await getReportImport(deps.db, importId);
  if (!row) throw notFound(`Importação ${importId} não encontrada.`);
  if (row.status === 'committed') {
    const existing = await countObservations(deps.db, importId);
    return { observations: existing };
  }
  const dupe = await findCommittedImport(deps.db, row.clientId, row.sha256, row.mappingVersion);
  if (dupe) {
    throw conflict(`Conteúdo já confirmado na importação ${dupe.id} — sem duplicar fatos.`);
  }
  const staged = await listImportRows(deps.db, importId);
  const valid = staged.filter((r) => r.status === 'valid' && r.mapped);
  if (valid.length === 0) throw unprocessable('Nenhuma linha válida para confirmar.');
  const context = row.context as ReportImportContext;
  await insertObservations(
    deps.db,
    valid.map((r) => {
      const mapped = r.mapped as {
        localRowId: string;
        adId: string | null;
        adName: string;
        dateStart: string;
        dateStop: string;
        grain: string;
        metrics: Record<string, number | string>;
      };
      return {
        clientId: row.clientId,
        adAccountId: row.adAccountId,
        importId: row.id,
        localRowId: mapped.localRowId,
        adId: mapped.adId,
        adName: mapped.adName,
        entityLevel: context.entityLevel,
        dateStart: mapped.dateStart,
        dateStop: mapped.dateStop,
        grain: mapped.grain,
        attribution: context.attribution,
        coverage: context.coverage,
        currency: context.currency,
        breakdownSignature: '',
        metricDefinitionVersion: 'v1',
        metrics: mapped.metrics,
        source: 'file',
      };
    }),
  );
  await markImportCommitted(deps.db, importId);
  await audit(deps.db, {
    actor: { id: actor.id, email: actor.email },
    action: 'report_import.commit',
    entityType: 'report_import',
    entityId: importId,
    after: { observations: valid.length },
  });
  return { observations: valid.length };
}
