import type { Logger } from 'pino';

export interface AlertInput {
  title: string;
  detail: string;
  severity: 'info' | 'warning' | 'critical';
  context?: Record<string, unknown>;
}

/**
 * R17: alertas operacionais (token inválido, conta bloqueada, lote com muitas
 * falhas). Sem webhook configurado, o alerta ainda vai para o log estruturado.
 */
export function createAlerter(webhookUrl: string | undefined, log: Logger) {
  return async function alert(input: AlertInput): Promise<void> {
    const payload = {
      text: `[AdPub/${input.severity}] ${input.title}\n${input.detail}`,
      ...(input.context ? { attachments: [{ text: JSON.stringify(input.context) }] } : {}),
    };
    log[input.severity === 'info' ? 'info' : input.severity === 'warning' ? 'warn' : 'error'](
      { alert: input.title, ...input.context },
      input.detail,
    );
    if (!webhookUrl) return;
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      log.warn({ err: error }, 'falha ao enviar alerta');
    }
  };
}

export type Alerter = ReturnType<typeof createAlerter>;
