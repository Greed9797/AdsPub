/** T-007-1: snapshot determinístico + validação da saída da IA. Sem número sem dono. */
import { readFileSync } from 'node:fs';
export interface SnapshotRow {
  id: string;
  name: string;
  spend: number;
  results: number | null;
  cpa: number | null;
}

export interface SnapshotContent {
  assetId: string;
  observations: Array<{ tipo: string; texto: string }>;
}

export interface ReportSnapshot {
  accountId: string;
  from: string;
  to: string;
  source: string;
  totals: { spend: number; results: number | null };
  rows: SnapshotRow[];
  hasMetrics: boolean;
  hasMedia: boolean;
  selectionCoverage: 'all' | 'selected' | 'unknown';
  content: SnapshotContent[];
}

export interface FindingRef {
  kind: 'metric' | 'content' | 'row';
  ref: string;
}

export interface PerformanceFinding {
  text: string;
  metric?: string;
  value?: number;
  entity_id?: string;
}

export interface Hypothesis {
  text: string;
  support_refs: FindingRef[];
  confounders: string[];
  test: string;
}

export interface RecommendedTest {
  variable: string;
  keeps: string[];
  goal: string;
  metric: string;
  preconditions: string[];
}

export interface ReportOutput {
  performance_findings: PerformanceFinding[];
  content_observations: string[];
  hypotheses: Hypothesis[];
  recommended_tests: RecommendedTest[];
  limitations: string[];
}

export const REPORT_PROMPT_VERSION = 'report.v1';
export const REPORT_SCHEMA_VERSION = 'report.v1';

export function loadReportPrompt(): string {
  try {
    return readFileSync(new URL('../prompts/report.v1.md', import.meta.url), 'utf8');
  } catch {
    return 'Responda só com fatos do snapshot, hipóteses com evidências e testes. Sem causalidade prometida.';
  }
}

export const REPORT_SCHEMA = {
  type: 'object',
  required: ['performance_findings', 'content_observations', 'hypotheses', 'recommended_tests', 'limitations'],
  properties: {
    performance_findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['text'],
        properties: {
          text: { type: 'string' },
          metric: { type: 'string' },
          value: { type: 'number' },
          entity_id: { type: 'string' },
        },
      },
    },
    content_observations: { type: 'array', items: { type: 'string' } },
    hypotheses: {
      type: 'array',
      items: {
        type: 'object',
        required: ['text', 'support_refs', 'confounders', 'test'],
        properties: {
          text: { type: 'string' },
          support_refs: {
            type: 'array',
            items: {
              type: 'object',
              required: ['kind', 'ref'],
              properties: { kind: { type: 'string', enum: ['metric', 'content', 'row'] }, ref: { type: 'string' } },
            },
          },
          confounders: { type: 'array', items: { type: 'string' } },
          test: { type: 'string' },
        },
      },
    },
    recommended_tests: {
      type: 'array',
      items: {
        type: 'object',
        required: ['variable', 'keeps', 'goal', 'metric', 'preconditions'],
        properties: {
          variable: { type: 'string' },
          keeps: { type: 'array', items: { type: 'string' } },
          goal: { type: 'string' },
          metric: { type: 'string' },
          preconditions: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    limitations: { type: 'array', items: { type: 'string' } },
  },
} as const;

function recompute(snapshot: ReportSnapshot, metric: string, entityId?: string): number | null {
  const rows = entityId ? snapshot.rows.filter((r) => r.id === entityId) : snapshot.rows;
  if (rows.length === 0) return null;
  const spend = rows.reduce((a, r) => a + r.spend, 0);
  const results = rows.reduce((a, r) => a + (r.results ?? 0), 0);
  const hasResults = rows.some((r) => r.results !== null);
  switch (metric) {
    case 'spend':
      return spend;
    case 'results':
      return hasResults ? results : null;
    case 'cpa':
      return hasResults && results > 0 ? spend / results : null;
    default:
      return null;
  }
}

/**
 * Valida a saída antes de persistir. Número divergente, referência
 * inexistente ou afirmação sem base bloqueia a emissão (AC-007-03).
 */
export function validateReportOutput(output: ReportOutput, snapshot: ReportSnapshot): string[] {
  const issues: string[] = [];
  if (!Array.isArray(output.performance_findings) || !Array.isArray(output.hypotheses)) {
    return ['saída fora do schema'];
  }
  if (!snapshot.hasMetrics && output.performance_findings.length > 0) {
    issues.push('sem métricas: performance_findings deve ser vazio (AC-007-01)');
  }
  for (const finding of output.performance_findings) {
    if (finding.metric === undefined || finding.value === undefined) continue;
    const expected = snapshot.hasMetrics ? recompute(snapshot, finding.metric, finding.entity_id) : null;
    if (expected === null || Math.abs(expected - finding.value) > 1e-6) {
      issues.push(`número sem lastro: ${finding.metric}=${finding.value} (esperado ${expected})`);
    }
    if (finding.entity_id && !snapshot.rows.some((r) => r.id === finding.entity_id)) {
      issues.push(`entidade inexistente: ${finding.entity_id}`);
    }
  }
  const contentIds = new Set(snapshot.content.map((c) => c.assetId));
  for (const hypothesis of output.hypotheses) {
    for (const ref of hypothesis.support_refs ?? []) {
      if (ref.kind === 'content' && !contentIds.has(ref.ref)) {
        issues.push(`evidência de conteúdo inexistente: ${ref.ref}`);
      }
      if (ref.kind === 'row' && !snapshot.rows.some((r) => r.id === ref.ref)) {
        issues.push(`evidência de linha inexistente: ${ref.ref}`);
      }
    }
    if (!snapshot.hasMedia && (hypothesis.text.match(/cena|frame|gancho|abertura|vídeo|imagem/i) || output.content_observations.length > 0)) {
      issues.push('sem mídia: sem causa de cena (AC-007-02)');
      break;
    }
  }
  if (snapshot.selectionCoverage !== 'all') {
    const joined = output.limitations.join(' ').toLowerCase();
    if (!/vencedor|selecion|selec|winner|parcial|bias|viés|vies/.test(joined)) {
      issues.push('seleção parcial exige viés declarado nas limitações (AC-007-04)');
    }
  }
  return issues;
}
