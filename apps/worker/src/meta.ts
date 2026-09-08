import {
  getConnectionForAccount,
  getConnectionToken,
  pauseAccountsOfConnection,
  recordAccountUsage,
  recordMetaCall,
  updateConnectionStatus,
} from '@adpub/db';
import { MetaClient, pauseDurationMs, shouldThrottle, type RateUsage } from '@adpub/meta-client';
import type { WorkerContext } from './context.js';
import type { Alerter } from './alerts.js';

export interface MetaFactory {
  forAccount(adAccountId: string, adDraftId?: string): Promise<MetaClient>;
  forConnection(connectionId: string): Promise<MetaClient>;
  /** US1 cenário 3: token inválido pausa todas as contas da conexão e alerta. */
  handleAuthFailure(connectionId: string, detail: string): Promise<void>;
}

export function createMetaFactory(ctx: WorkerContext, alert: Alerter): MetaFactory {
  function build(input: {
    token: string;
    adAccountId?: string;
    adDraftId?: string;
    connectionId?: string;
  }): MetaClient {
    return new MetaClient({
      version: ctx.env.META_API_VERSION,
      appId: ctx.env.META_APP_ID,
      appSecret: ctx.env.META_APP_SECRET,
      baseUrl: ctx.env.META_BASE_URL,
      token: input.token,
      ...(ctx.fetchImpl ? { fetchImpl: ctx.fetchImpl } : {}),
      ...(input.adAccountId ? { adAccountId: input.adAccountId } : {}),
      ...(input.adDraftId ? { adDraftId: input.adDraftId } : {}),
      onCall: (log) => {
        void recordMetaCall(ctx.db, {
          adAccountId: log.adAccountId ?? input.adAccountId ?? null,
          adDraftId: log.adDraftId ?? input.adDraftId ?? null,
          method: log.method,
          endpoint: log.endpoint,
          apiVersion: log.apiVersion,
          statusCode: log.statusCode,
          latencyMs: log.latencyMs,
          errorCode: log.errorCode ?? null,
          errorSubcode: log.errorSubcode ?? null,
          usage: log.usage ?? {},
        }).catch((error: unknown) => ctx.log.warn({ err: error }, 'falha ao registrar chamada'));
      },
      onUsage: (usage, adAccountId) => {
        const target = adAccountId ?? input.adAccountId;
        if (!target) return;
        void persistUsage(ctx, alert, target, usage).catch((error: unknown) =>
          ctx.log.warn({ err: error }, 'falha ao registrar uso de rate limit'),
        );
      },
    });
  }

  return {
    async forAccount(adAccountId, adDraftId) {
      const { connection, token } = await getConnectionForAccount(ctx.db, adAccountId);
      return build({
        token,
        adAccountId,
        connectionId: connection.id,
        ...(adDraftId ? { adDraftId } : {}),
      });
    },
    async forConnection(connectionId) {
      const token = await getConnectionToken(ctx.db, connectionId);
      if (!token) throw new Error(`Conexão ${connectionId} sem token utilizável.`);
      return build({ token, connectionId });
    },
    async handleAuthFailure(connectionId, detail) {
      const pausedUntil = new Date(Date.now() + 60 * 60 * 1000);
      await updateConnectionStatus(ctx.db, connectionId, {
        status: 'needs_attention',
        lastError: detail,
      });
      const paused = await pauseAccountsOfConnection(ctx.db, connectionId, pausedUntil);
      await alert({
        title: 'Token da BM inválido',
        detail: `${detail} — ${paused} conta(s) com fila pausada até ${pausedUntil.toISOString()}.`,
        severity: 'critical',
        context: { connection_id: connectionId },
      });
    },
  };
}

/** R6: acima do teto, pausa a conta pelo tempo estimado de recuperação. */
async function persistUsage(
  ctx: WorkerContext,
  alert: Alerter,
  adAccountId: string,
  usage: RateUsage,
): Promise<void> {
  const throttle = shouldThrottle(usage);
  const pausedUntil = throttle
    ? new Date(Date.now() + pauseDurationMs(usage.estimatedTimeToRegainAccessMs, 1))
    : null;

  await recordAccountUsage(
    ctx.db,
    adAccountId,
    {
      max_percent: usage.maxPercent,
      tier: usage.tier,
      raw: usage.raw,
      estimated_time_to_regain_access_ms: usage.estimatedTimeToRegainAccessMs,
      observed_at: new Date().toISOString(),
    },
    pausedUntil,
  );

  if (throttle) {
    await alert({
      title: 'Rate limit próximo do teto',
      detail: `Conta ${adAccountId} em ${usage.maxPercent}% do limite. Fila pausada até ${pausedUntil?.toISOString()}.`,
      severity: 'warning',
      context: { ad_account_id: adAccountId, tier: usage.tier },
    });
  }
}
