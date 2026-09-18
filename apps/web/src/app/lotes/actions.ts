import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { batchPlanSchema, ctaSchema, type BatchPlan } from '@adpub/shared';

import { ApiError, api } from '@/lib/api';
import type { Copy, AdDraft, Batch, PublishResult, ValidationReport } from '@/lib/types';
import { requireRole } from '@/lib/session';

export type ActionResult<T> = { sucesso: true; data: T } | { erro: string };

const uuid = z.string().uuid('Informe um identificador válido.');
/** Id de conta da Meta é `act_<numero>`, nunca UUID. */
const accountId = z.string().trim().min(1, 'Selecione a conta de anúncios.');

const createBatchSchema = z
  .object({
    name: z.string().trim().min(1, 'Informe o nome do lote.'),
    mode: z.enum(['ai', 'manual']),
    client_id: uuid,
    ad_account_id: accountId,
    briefing: z.string().trim().default(''),
    copies_per_creative: z.coerce
      .number()
      .int()
      .min(1, 'Escolha entre 1 e 5 cópias por criativo.')
      .max(5, 'Escolha entre 1 e 5 cópias por criativo.')
      .default(3),
    asset_ids: z.array(uuid).default([]),
  })
  .superRefine((value, ctx) => {
    if (value.mode !== 'ai') return;

    if (!value.briefing) {
      ctx.addIssue('Informe o briefing no modo IA.');
    }

    if (value.asset_ids.length === 0) {
      ctx.addIssue('Selecione pelo menos 1 criativo para o planejamento por IA.');
    }
  });

const planSchema = z.object({
  batch_id: uuid,
  asset_ids: z
    .array(uuid)
    .min(1, 'Selecione pelo menos 1 criativo para o planejamento.'),
  copies_per_creative: z
    .number()
    .int()
    .min(1, 'Escolha entre 1 e 5 cópias por criativo.')
    .max(5, 'Escolha entre 1 e 5 cópias por criativo.'),
  regenerate: z.boolean().default(false),
});

/**
 * `loose()` preserva campos da copy que a UI não edita (display_link, cards do carrossel):
 * a API remonta o item com `copy` inteiro, então descartá-los apagaria dados do anúncio.
 */
const copySchema = z
  .object({
    primary_text: z.string().trim().min(1, 'O texto principal é obrigatório.'),
    headline: z.string().trim().max(255, 'O título aceita até 255 caracteres.'),
    description: z.string().trim().max(255, 'A descrição aceita até 255 caracteres.'),
    cta: ctaSchema,
    link: z.string().trim(),
    url_tags: z.string().trim(),
  })
  .loose();

const saveItemSchema = z.object({
  batch_id: uuid,
  item_id: uuid,
  version: z.number().int().nonnegative(),
  name: z.string().trim().min(1, 'Informe o nome do item.'),
  page_id: z.string().trim().min(1, 'Informe a página do anúncio.'),
  ig_user_id: z.string().trim().min(1).nullable(),
  copy: copySchema,
});

const idSchema = z.object({
  batch_id: uuid,
  item_id: uuid,
});

/** Motivo é obrigatório nas duas decisões: a auditoria guarda o porquê. */
const resolveItemSchema = z.object({
  batch_id: uuid,
  item_id: uuid,
  decision: z.enum(['adopt', 'discard']),
  motive: z.string().trim().min(1, 'Descreva o que você conferiu na Meta.'),
  meta_ids: z.record(z.string(), z.unknown()).optional(),
  step: z.string().min(1).optional(),
});

const resolveRefSchema = z.object({
  batch_id: uuid,
  ref_key: z.string().trim().min(1),
  decision: z.enum(['adopt', 'discard']),
  motive: z.string().trim().min(1, 'Descreva o que você conferiu na Meta.'),
  meta_id: z.string().trim().min(1).optional(),
});

const publishRequestSchema = z.object({
  batch_id: uuid,
  only_failed: z.boolean(),
  confirm_count: z.number().int().min(0),
});

const duplicateSchema = z.object({
  batch_id: uuid,
  ad_account_id: accountId,
  name: z.string().trim().min(1).optional(),
});

function errorFromApi(error: unknown): string {
  if (error instanceof z.ZodError) {
    const issue = error.issues[0];
    return issue?.message ?? 'Dados inválidos.';
  }

  if (error instanceof ApiError) {
    const detail = error.problem?.detail;
    return typeof detail === 'string' && detail.trim() ? detail : error.problem?.title || 'Falha na API.';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Falha inesperada.';
}

export async function criarLote(formData: FormData): Promise<ActionResult<{ id: string }>> {
  'use server';
  await requireRole(['admin', 'coordinator', 'manager']);

  const parsed = createBatchSchema.safeParse({
    name: formData.get('name'),
    mode: formData.get('mode'),
    client_id: formData.get('client_id'),
    ad_account_id: formData.get('ad_account_id'),
    briefing: formData.get('briefing') ?? '',
    copies_per_creative: formData.get('copies_per_creative') ?? undefined,
    asset_ids: formData.getAll('asset_ids').filter((value): value is string => typeof value === 'string'),
  });

  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }

  const input = parsed.data;

  const created = await api<Batch>('/batches', {
    method: 'POST',
    body: {
      client_id: input.client_id,
      ad_account_id: input.ad_account_id,
      name: input.name,
      mode: input.mode,
      ...(input.briefing ? { briefing: input.briefing } : {}),
    },
  }).catch((error: unknown) => ({ erro: errorFromApi(error) }));

  if ('erro' in created) {
    return created;
  }

  revalidatePath('/');

  if (input.mode === 'ai') {
    const plan = await gerarPlano({
      batch_id: created.id,
      asset_ids: input.asset_ids,
      copies_per_creative: input.copies_per_creative,
    });

    if ('erro' in plan) {
      redirect(`/lotes/${created.id}?erro=${encodeURIComponent(plan.erro)}`);
    }
  }

  redirect(`/lotes/${created.id}`);
}

export async function gerarPlano(data: {
  batch_id: string;
  asset_ids: string[];
  copies_per_creative: number;
  regenerate?: boolean;
}): Promise<ActionResult<Batch>> {
  'use server';
  await requireRole(['admin', 'coordinator', 'manager']);
  try {
    const parsed = planSchema.parse({
      batch_id: data.batch_id,
      asset_ids: data.asset_ids,
      copies_per_creative: data.copies_per_creative,
      regenerate: data.regenerate ?? false,
    });

    const updated = await api<Batch>(`/batches/${parsed.batch_id}/plan`, {
      method: 'POST',
      body: {
        asset_ids: parsed.asset_ids,
        copies_per_creative: parsed.copies_per_creative,
        regenerate: parsed.regenerate,
      },
    });

    revalidatePath(`/lotes/${parsed.batch_id}`);
    return { sucesso: true, data: updated };
  } catch (error) {
    return { erro: errorFromApi(error) };
  }
}

/**
 * FR-008: construtor manual. O corpo é o mesmo `BatchPlan` do modo IA, então a API
 * materializa 1 item por (criativo × copy), aplica nomenclatura/UTM e valida igual.
 */
export async function salvarPlanoManual(data: {
  batch_id: string;
  plan: BatchPlan;
}): Promise<ActionResult<Batch>> {
  'use server';

  try {
    await requireRole(['admin', 'coordinator', 'manager']);
    const parsed = z.object({ batch_id: uuid, plan: batchPlanSchema }).parse(data);

    const updated = await api<Batch>(`/batches/${parsed.batch_id}/plan`, {
      method: 'PUT',
      body: parsed.plan,
    });

    revalidatePath(`/lotes/${parsed.batch_id}`);
    return { sucesso: true, data: updated };
  } catch (error) {
    return { erro: errorFromApi(error) };
  }
}

export async function salvarItem(data: {
  batch_id: string;
  item_id: string;
  version: number;
  name: string;
  page_id: string;
  ig_user_id: string | null;
  copy: Copy;
}): Promise<ActionResult<AdDraft>> {
  'use server';

  try {
    await requireRole(['admin', 'coordinator', 'manager']);
    const parsed = saveItemSchema.parse(data);

    const updated = await api<AdDraft>(`/batches/${parsed.batch_id}/items/${parsed.item_id}`, {
      method: 'PATCH',
      body: {
        version: parsed.version,
        name: parsed.name,
        page_id: parsed.page_id,
        ig_user_id: parsed.ig_user_id,
        copy: parsed.copy,
      },
    });

    revalidatePath(`/lotes/${parsed.batch_id}`);
    return { sucesso: true, data: updated };
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      return {
        erro: 'Item alterado por outra operação. Recarregue o lote e tente novamente.',
      };
    }

    return { erro: errorFromApi(error) };
  }
}

export async function removerItem(data: {
  batch_id: string;
  item_id: string;
}): Promise<ActionResult<{ ok: true }>> {
  'use server';

  try {
    await requireRole(['admin', 'coordinator', 'manager']);
    const parsed = idSchema.parse(data);

    await api<void>(`/batches/${parsed.batch_id}/items/${parsed.item_id}`, {
      method: 'DELETE',
    });

    revalidatePath(`/lotes/${parsed.batch_id}`);
    return { sucesso: true, data: { ok: true } };
  } catch (error) {
    return { erro: errorFromApi(error) };
  }
}

export async function reprocessarItem(data: {
  batch_id: string;
  item_id: string;
}): Promise<ActionResult<{ job_id: string; queue: string }>> {
  'use server';
  await requireRole(['admin', 'coordinator', 'manager']);
  try {
    const parsed = idSchema.parse(data);

    const queued = await api<{ job_id: string; queue: string }>(
      `/batches/${parsed.batch_id}/items/${parsed.item_id}/retry`,
      {
        method: 'POST',
      },
    );

    revalidatePath(`/lotes/${parsed.batch_id}`);
    return { sucesso: true, data: queued };
  } catch (error) {
    return { erro: errorFromApi(error) };
  }
}

/**
 * Reconciliação do item: adotar exige o ID conferido na Meta e a etapa de
 * retomada; descartar encerra o item com o motivo. Nunca recria às cegas.
 */
export async function resolverItem(data: {
  batch_id: string;
  item_id: string;
  decision: 'adopt' | 'discard';
  motive: string;
  meta_ids?: Record<string, unknown>;
  step?: string;
}): Promise<ActionResult<{ status: string }>> {
  'use server';
  try {
    await requireRole(['admin', 'coordinator', 'manager']);
    const parsed = resolveItemSchema.parse(data);

    const result = await api<{ status: string }>(
      `/batches/${parsed.batch_id}/items/${parsed.item_id}/resolve`,
      {
        method: 'POST',
        body: {
          decision: parsed.decision,
          motive: parsed.motive,
          ...(parsed.meta_ids ? { meta_ids: parsed.meta_ids } : {}),
          ...(parsed.step ? { step: parsed.step } : {}),
        },
      },
    );

    revalidatePath(`/lotes/${parsed.batch_id}`);
    return { sucesso: true, data: result };
  } catch (error) {
    return { erro: errorFromApi(error) };
  }
}

/** Reconciliação da campanha/conjunto compartilhado do lote. */
export async function resolverRef(data: {
  batch_id: string;
  ref_key: string;
  decision: 'adopt' | 'discard';
  motive: string;
  meta_id?: string;
}): Promise<ActionResult<{ ref_key: string; state: string }>> {
  'use server';
  try {
    await requireRole(['admin', 'coordinator', 'manager']);
    const parsed = resolveRefSchema.parse(data);

    const result = await api<{ ref_key: string; state: string }>(
      `/batches/${parsed.batch_id}/refs/${encodeURIComponent(parsed.ref_key)}/resolve`,
      {
        method: 'POST',
        body: {
          decision: parsed.decision,
          motive: parsed.motive,
          ...(parsed.meta_id ? { meta_id: parsed.meta_id } : {}),
        },
      },
    );

    revalidatePath(`/lotes/${parsed.batch_id}`);
    return { sucesso: true, data: result };
  } catch (error) {
    return { erro: errorFromApi(error) };
  }
}

export async function validarLote(data: {
  batch_id: string;
}): Promise<ActionResult<ValidationReport>> {
  'use server';

  try {
    await requireRole(['admin', 'coordinator', 'manager']);
    const parsed = z.object({ batch_id: uuid }).parse(data);

    const report = await api<ValidationReport>(`/batches/${parsed.batch_id}/validate`, {
      method: 'POST',
    });

    revalidatePath(`/lotes/${parsed.batch_id}`);
    return { sucesso: true, data: report };
  } catch (error) {
    return { erro: errorFromApi(error) };
  }
}

export async function publicarLote(data: {
  batch_id: string;
  only_failed: boolean;
  confirm_count: number;
}): Promise<ActionResult<PublishResult>> {
  'use server';

  try {
    await requireRole(['admin', 'coordinator', 'manager']);
    const parsed = publishRequestSchema.parse(data);

    const result = await api<PublishResult>(`/batches/${parsed.batch_id}/publish`, {
      method: 'POST',
      body: {
        only_failed: parsed.only_failed,
        confirm_count: parsed.confirm_count,
      },
    });

    revalidatePath(`/lotes/${parsed.batch_id}`);
    revalidatePath('/');
    return { sucesso: true, data: result };
  } catch (error) {
    return { erro: errorFromApi(error) };
  }
}

export async function duplicarLote(data: {
  batch_id: string;
  ad_account_id: string;
  name?: string;
}): Promise<ActionResult<Batch>> {
  'use server';

  try {
    await requireRole(['admin', 'coordinator']);
    const parsed = duplicateSchema.parse(data);

    const duplicated = await api<Batch>(`/batches/${parsed.batch_id}/duplicate`, {
      method: 'POST',
      body: {
        ad_account_id: parsed.ad_account_id,
        ...(parsed.name ? { name: parsed.name } : {}),
      },
    });

    revalidatePath('/');
    revalidatePath(`/lotes/${parsed.batch_id}`);
    revalidatePath(`/lotes/${duplicated.id}`);
    return { sucesso: true, data: duplicated };
  } catch (error) {
    return { erro: errorFromApi(error) };
  }
}
