import { describe, expect, it } from 'vitest';
import type { AdDraftStatus, PublishStep } from '../src/enums.js';
import {
  assertTransition,
  canTransition,
  deriveBatchStatus,
  nextStep,
  statusForStep,
  STEP_ORDER,
} from '../src/state-machine.js';

const ETAPAS = STEP_ORDER.filter((step): step is Exclude<PublishStep, 'done'> => step !== 'done');

describe('retomada e retry (R3/R4)', () => {
  it('reprocessar retoma em qualquer etapa salva', () => {
    // `markDraftsQueued` preserva `publish_jobs.step`: um item que falhou em
    // `create_creative` volta a `queued` e o worker reentra em `creating_creative`.
    for (const step of ETAPAS) {
      expect(canTransition('queued', statusForStep(step))).toBe(true);
    }
  });

  it('falha transiente permite reentrar na mesma etapa', () => {
    for (const step of ETAPAS) {
      const status = statusForStep(step);
      expect(canTransition(status, status)).toBe(true);
    }
  });

  it('job reagendado pelo BullMQ retoma de failed na etapa salva', () => {
    // Erro não transiente marca `failed` e relança: o BullMQ ainda tem
    // tentativas (RETRY.maxAttempts) e roda `runPublish` de novo com o item
    // nesse estado.
    for (const step of ETAPAS) {
      expect(canTransition('failed', statusForStep(step))).toBe(true);
    }
  });

  it('cada etapa avança para a seguinte e pode falhar', () => {
    for (const step of ETAPAS) {
      expect(canTransition(statusForStep(step), statusForStep(nextStep(step)))).toBe(true);
      expect(canTransition(statusForStep(step), 'failed')).toBe(true);
    }
  });
});

describe('invariantes do item', () => {
  it('não anda para trás no pipeline', () => {
    expect(canTransition('creating_ad', 'uploading_media')).toBe(false);
    expect(canTransition('ensuring_adset', 'ensuring_campaign')).toBe(false);
    expect(canTransition('creating_creative', 'queued')).toBe(false);
  });

  it('publicado nunca volta para o pipeline', () => {
    const proibidos: AdDraftStatus[] = ['queued', 'ready', 'draft', 'failed', 'creating_ad'];
    for (const status of proibidos) {
      expect(canTransition('published', status)).toBe(false);
      expect(canTransition('approved', status)).toBe(false);
    }
    expect(() => assertTransition('published', 'queued')).toThrow(/Transição inválida/);
  });

  it('bloqueado só sai por nova validação', () => {
    expect(canTransition('blocked', 'ready')).toBe(true);
    expect(canTransition('blocked', 'queued')).toBe(false);
  });
});

describe('reconciliação (T-000-2 / AC-000-03)', () => {
  it('etapa de criação com resposta perdida para em reconciliação', () => {
    for (const step of ETAPAS) {
      expect(canTransition(statusForStep(step), 'needs_reconciliation')).toBe(true);
    }
    expect(canTransition('ready', 'needs_reconciliation')).toBe(false);
    expect(canTransition('published', 'needs_reconciliation')).toBe(false);
  });

  it('reconciliação só sai por retomada auditada ou descarte', () => {
    expect(canTransition('needs_reconciliation', 'queued')).toBe(true);
    expect(canTransition('needs_reconciliation', 'failed')).toBe(true);
    expect(canTransition('needs_reconciliation', 'published')).toBe(false);
    expect(canTransition('needs_reconciliation', 'creating_ad')).toBe(false);
    expect(canTransition('needs_reconciliation', 'ready')).toBe(false);
  });

  it('lote com reconciliação pendente é parcial, nunca concluído', () => {
    expect(deriveBatchStatus(['published', 'needs_reconciliation'])).toBe('partial');
    expect(deriveBatchStatus(['needs_reconciliation'])).toBe('partial');
    expect(deriveBatchStatus(['failed', 'failed'])).toBe('failed');
  });
});

describe('deriveBatchStatus', () => {
  it('resume os itens no estado do lote', () => {
    expect(deriveBatchStatus([])).toBe('draft');
    expect(deriveBatchStatus(['ready', 'ready'])).toBe('ready');
    expect(deriveBatchStatus(['ready', 'queued'])).toBe('publishing');
    expect(deriveBatchStatus(['published', 'approved'])).toBe('done');
    expect(deriveBatchStatus(['published', 'failed'])).toBe('partial');
    expect(deriveBatchStatus(['failed', 'failed'])).toBe('failed');
    expect(deriveBatchStatus(['blocked', 'ready'])).toBe('blocked');
  });
});
