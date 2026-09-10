import { ProblemError } from './problem.js';
import type { ApiDeps } from './deps.js';

/** T-009-3: flags desligam inteligência com 503; publish nunca passa aqui. */
export function requireFeature(deps: ApiDeps, flag: 'featureAiAnalysis' | 'featureReports' | 'featureInsights'): void {
  if (!deps.env[flag]) {
    throw new ProblemError({
      status: 503,
      title: 'Funcionalidade desligada',
      detail: `Flag ${flag} desativada pelo operador. Publicação segue normal.`,
    });
  }
}
