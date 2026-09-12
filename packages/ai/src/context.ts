import type { AdFormat, VoiceProfile } from '@adpub/shared';

export interface AiAssetRef {
  id: string;
  filename: string;
  kind: 'image' | 'video';
  aspect_ratio: string;
  duration_ms?: number | null;
  /**
   * A1: o que já foi observado nesta peça, com origem. Sem análise, o campo
   * fica ausente e o contexto diz isso em vez de deixar a IA supor a imagem.
   */
  insight?: AiAssetInsight | null;
}

export interface AiAssetInsight {
  /** Fatos observados na peça (evidência validada na análise). */
  observations: string[];
  limitations: string[];
  /** > 1 = análise corrigida por pessoa. */
  revision: number;
  analyzed_at: string;
  transcript: 'ready' | 'unavailable';
}

/** Aprendizado do cliente; o nível de evidência nunca é omitido. */
export interface AiLearningRef {
  hypothesis: string;
  evidence_level: string;
  limitations: string[];
  outcome?: string | null;
}

export interface AiObjectRef {
  id: string;
  name: string;
  objective?: string;
  campaign_id?: string;
}

export interface PlanContext {
  briefing: string;
  copiesPerCreative: number;
  /** A12: hipóteses registradas do cliente, sempre com o nível de evidência. */
  learnings?: AiLearningRef[];
  account: {
    id: string;
    name: string;
    currency: string;
    timezone: string;
    default_page_id?: string | null;
    default_ig_user_id?: string | null;
    default_pixel_id?: string | null;
  };
  client: {
    name: string;
    voice_profile: VoiceProfile;
    naming_template: string;
    default_utm: Record<string, string>;
    landing_domains: string[];
  };
  assets: AiAssetRef[];
  campaigns: AiObjectRef[];
  adsets: AiObjectRef[];
}

export interface CopyContext {
  client: { name: string; voice_profile: VoiceProfile };
  asset: AiAssetRef;
  format: AdFormat;
  cta: string;
  link: string;
  url_tags: string;
  variations: number;
  briefing?: string;
  /** Fatos observados no criativo (análise visual revisada), nunca inferidos aqui. */
  observations?: string[];
}

const MAX_INSIGHT_OBSERVATIONS = 8;

/**
 * A1: análise visual entra como fato observado com origem — ou como ausência
 * explícita. Sem isto a IA escrevia sobre uma peça que nunca viu.
 */
function renderInsight(insight: AiAssetInsight | null): string[] {
  if (!insight || insight.observations.length === 0) {
    return ['  - sem análise visual deste criativo: não descreva a imagem/vídeo; use só o briefing.'];
  }
  const revisao = insight.revision > 1 ? `revisão ${insight.revision}, corrigida por pessoa` : `revisão ${insight.revision}`;
  const lines = [`  - observado na peça (${revisao}, ${insight.analyzed_at}; transcrição: ${insight.transcript}):`];
  for (const observation of insight.observations.slice(0, MAX_INSIGHT_OBSERVATIONS)) {
    lines.push(`    - ${observation}`);
  }
  if (insight.observations.length > MAX_INSIGHT_OBSERVATIONS) {
    lines.push(`    - (+${insight.observations.length - MAX_INSIGHT_OBSERVATIONS} observações omitidas)`);
  }
  for (const limitation of insight.limitations.slice(0, 5)) {
    lines.push(`    - limite da análise: ${limitation}`);
  }
  return lines;
}

export function renderPlanContext(ctx: PlanContext): string {
  const lines: string[] = [];
  lines.push('## Conta de anúncio');
  lines.push(
    `- ${ctx.account.id} — ${ctx.account.name} (${ctx.account.currency}, ${ctx.account.timezone})`,
  );
  lines.push(`- página padrão: ${ctx.account.default_page_id ?? '(não definida)'}`);
  lines.push(`- instagram padrão: ${ctx.account.default_ig_user_id ?? '(não vinculado)'}`);
  lines.push(`- pixel padrão: ${ctx.account.default_pixel_id ?? '(não definido)'}`);

  lines.push('', '## Cliente e voz');
  lines.push(`- cliente: ${ctx.client.name}`);
  lines.push(`- tom: ${ctx.client.voice_profile.tone || '(livre)'}`);
  lines.push(`- público: ${ctx.client.voice_profile.audience || '(não informado)'}`);
  lines.push(
    `- termos proibidos: ${ctx.client.voice_profile.forbidden_terms.join(', ') || '(nenhum)'}`,
  );
  lines.push(
    `- claims permitidos: ${ctx.client.voice_profile.allowed_claims.join(', ') || '(nenhum)'}`,
  );
  if (ctx.client.voice_profile.examples.length > 0) {
    lines.push('- exemplos aprovados:');
    for (const example of ctx.client.voice_profile.examples.slice(0, 5)) {
      lines.push(`  - ${example}`);
    }
  }
  lines.push(`- domínios permitidos: ${ctx.client.landing_domains.join(', ') || '(qualquer)'}`);

  lines.push('', '## Criativos disponíveis');
  if (ctx.assets.length === 0) lines.push('- (nenhum criativo selecionado)');
  for (const asset of ctx.assets) {
    const duration = asset.duration_ms ? `, ${Math.round(asset.duration_ms / 1000)}s` : '';
    lines.push(
      `- ${asset.id} — ${asset.filename} (${asset.kind}, ${asset.aspect_ratio}${duration})`,
    );
    lines.push(...renderInsight(asset.insight ?? null));
  }

  lines.push('', '## Campanhas existentes');
  if (ctx.campaigns.length === 0) lines.push('- (nenhuma)');
  for (const campaign of ctx.campaigns.slice(0, 50)) {
    lines.push(`- ${campaign.id} — ${campaign.name} (${campaign.objective ?? 'sem objetivo'})`);
  }

  lines.push('', '## Conjuntos existentes');
  if (ctx.adsets.length === 0) lines.push('- (nenhum)');
  for (const adset of ctx.adsets.slice(0, 50)) {
    lines.push(`- ${adset.id} — ${adset.name} (campanha ${adset.campaign_id ?? '?'})`);
  }

  if (ctx.learnings && ctx.learnings.length > 0) {
    lines.push('', '## Aprendizados registrados deste cliente');
    lines.push(
      'Estado de evidência manda: hipótese é direção, nunca prova. Não escreva como fato o que não estiver em "claims permitidos".',
    );
    for (const learning of ctx.learnings.slice(0, 5)) {
      const parts = [`- [${learning.evidence_level}] ${learning.hypothesis}`];
      if (learning.outcome) parts.push(`  resultado registrado: ${learning.outcome}`);
      if (learning.limitations.length > 0) {
        parts.push(`  limitações: ${learning.limitations.join('; ')}`);
      }
      lines.push(...parts);
    }
  }

  lines.push('', '## Parâmetros');
  lines.push(`- copies_per_creative: ${ctx.copiesPerCreative}`);

  lines.push('', '## Briefing');
  lines.push(ctx.briefing.trim() || '(briefing vazio — devolva plano parcial com pendências)');

  return lines.join('\n');
}

export function renderCopyContext(ctx: CopyContext): string {
  const voice = ctx.client.voice_profile;
  const lines = [
    `Cliente: ${ctx.client.name}`,
    `Tom: ${voice.tone || '(livre)'}`,
    `Público: ${voice.audience || '(não informado)'}`,
    `Termos proibidos: ${voice.forbidden_terms.join(', ') || '(nenhum)'}`,
    `Claims permitidos: ${voice.allowed_claims.join(', ') || '(nenhum — não invente prova)'}`,
  ];
  if (voice.examples.length > 0) {
    lines.push('Exemplos aprovados (referência de voz; não copie literalmente):');
    for (const example of voice.examples.slice(0, 5)) lines.push(`  - ${example}`);
  }
  lines.push(
    `Criativo: ${ctx.asset.filename} (${ctx.asset.kind}, ${ctx.asset.aspect_ratio})`,
    `Formato: ${ctx.format}`,
    `CTA: ${ctx.cta}`,
    `Link: ${ctx.link || '(pendente — deixe vazio)'}`,
    `url_tags: ${ctx.url_tags || '(vazio)'}`,
    `Variações: ${ctx.variations}`,
  );
  if (ctx.observations && ctx.observations.length > 0) {
    lines.push('', 'Observações do criativo (fatos observados; não invente o que não está aqui):');
    for (const observation of ctx.observations.slice(0, 12)) {
      lines.push(`- ${observation}`);
    }
  }
  lines.push('', 'Briefing:', ctx.briefing?.trim() || '(sem briefing adicional)');
  return lines.join('\n');
}
