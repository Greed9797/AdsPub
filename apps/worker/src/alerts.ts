import type { Logger } from 'pino';

export interface AlertInput {
  title: string;
  detail: string;
  severity: 'info' | 'warning' | 'critical';
  context?: Record<string, unknown>;
}

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

/** O Telegram recusa mensagem com mais de 4096 caracteres. */
const MAX_TEXT = 3900;

/** Os dois juntos ou nenhum — quem garante é `serverEnvSchema`, no config. */
export function telegramFromEnv(env: {
  TELEGRAM_BOT_TOKEN?: string | undefined;
  TELEGRAM_CHAT_ID?: string | undefined;
}): TelegramConfig | undefined {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return undefined;
  return { botToken: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID };
}

export type Alerter = (input: AlertInput) => Promise<void>;

/**
 * R17: alertas operacionais (token inválido, conta bloqueada, lote com muitas
 * falhas). Sem bot configurado, o alerta ainda vai para o log estruturado.
 *
 * O token do bot viaja no path da URL da Bot API, então o erro registrado é só
 * a mensagem/status — nunca a URL nem o objeto de erro cru, que carrega o
 * `cause` com a URL dentro (Constituição IV).
 */
export function createAlerter(telegram: TelegramConfig | undefined, log: Logger): Alerter {
  return async function alert(input: AlertInput): Promise<void> {
    log[input.severity === 'info' ? 'info' : input.severity === 'warning' ? 'warn' : 'error'](
      { alert: input.title, ...input.context },
      input.detail,
    );
    if (!telegram) return;

    const text = [
      `[AdPub/${input.severity}] ${input.title}`,
      input.detail,
      ...(input.context ? [JSON.stringify(input.context)] : []),
    ]
      .join('\n')
      .slice(0, MAX_TEXT);

    try {
      const response = await fetch(`https://api.telegram.org/bot${telegram.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: telegram.chatId, text, disable_web_page_preview: true }),
      });
      if (!response.ok) {
        log.warn({ status: response.status }, 'Telegram recusou o alerta');
      }
    } catch (error) {
      log.warn(
        { detail: error instanceof Error ? error.message : 'erro desconhecido' },
        'falha ao enviar alerta',
      );
    }
  };
}
