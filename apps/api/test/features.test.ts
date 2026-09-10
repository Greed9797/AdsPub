import { describe, expect, it } from 'vitest';
import { ProblemError } from '../src/lib/problem.js';
import { requireFeature } from '../src/lib/features.js';
import type { ApiDeps } from '../src/lib/deps.js';

const deps = (flags: Partial<ApiDeps['env']>): ApiDeps =>
  ({
    env: {
      authSecret: 'x',
      allowedDomain: 'x',
      metaApiVersion: 'v25.0',
      metaTier: 'limited',
      usePolicyAi: false,
      featureAiAnalysis: true,
      featureReports: true,
      featureInsights: true,
      ...flags,
    },
  }) as ApiDeps;

/** T-009-3: flags desligam inteligência com 503; publish não consulta flag. */
describe('requireFeature', () => {
  it('ligada passa', () => {
    expect(() => requireFeature(deps({}), 'featureReports')).not.toThrow();
  });

  it('desligada dá 503 com motivo', () => {
    try {
      requireFeature(deps({ featureAiAnalysis: false }), 'featureAiAnalysis');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ProblemError);
      expect((error as ProblemError).status).toBe(503);
    }
  });
});
