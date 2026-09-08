import type { AdFormat, Copy } from '@adpub/shared';

/** R9: payload de criativo por formato. Função pura — testável sem rede. */

export interface CreativeMedia {
  imageHash?: string;
  videoId?: string;
  thumbnailHash?: string;
  cards?: Array<{
    imageHash?: string;
    videoId?: string;
    headline: string;
    description: string;
    link: string;
  }>;
}

export interface CreativePayloadInput {
  name: string;
  pageId: string;
  igUserId?: string | null;
  format: AdFormat;
  copy: Copy;
  media: CreativeMedia;
  /** Opt-out das melhorias automáticas Advantage+ (padrão do cliente). */
  advantageCreativeOptout: boolean;
}

export interface CreativePayload {
  name: string;
  object_story_spec: Record<string, unknown>;
  degrees_of_freedom_spec: Record<string, unknown>;
  url_tags?: string;
}

function callToAction(copy: Copy): Record<string, unknown> | undefined {
  if (copy.cta === 'NO_BUTTON') return undefined;
  return { type: copy.cta, value: { link: copy.link } };
}

export function buildCreativePayload(input: CreativePayloadInput): CreativePayload {
  const { copy, media } = input;
  const storySpec: Record<string, unknown> = { page_id: input.pageId };
  if (input.igUserId) storySpec.instagram_user_id = input.igUserId;

  const cta = callToAction(copy);

  if (input.format === 'single_image') {
    if (!media.imageHash) throw new Error('Criativo de imagem sem image_hash.');
    storySpec.link_data = {
      image_hash: media.imageHash,
      link: copy.link,
      message: copy.primary_text,
      name: copy.headline,
      description: copy.description,
      ...(copy.display_link ? { caption: copy.display_link } : {}),
      ...(cta ? { call_to_action: cta } : {}),
    };
  } else if (input.format === 'single_video') {
    if (!media.videoId) throw new Error('Criativo de vídeo sem video_id.');
    storySpec.video_data = {
      video_id: media.videoId,
      ...(media.thumbnailHash ? { image_hash: media.thumbnailHash } : {}),
      title: copy.headline,
      message: copy.primary_text,
      link_description: copy.description,
      ...(cta ? { call_to_action: cta } : {}),
    };
  } else {
    const cards = media.cards ?? [];
    if (cards.length < 2) throw new Error('Carrossel precisa de pelo menos 2 cartões.');
    storySpec.link_data = {
      link: copy.link,
      message: copy.primary_text,
      ...(copy.headline ? { name: copy.headline } : {}),
      ...(copy.description ? { description: copy.description } : {}),
      multi_share_optimized: true,
      multi_share_end_card: false,
      ...(cta ? { call_to_action: cta } : {}),
      child_attachments: cards.map((card) => ({
        link: card.link || copy.link,
        name: card.headline,
        description: card.description,
        ...(card.imageHash ? { image_hash: card.imageHash } : {}),
        ...(card.videoId ? { video_id: card.videoId } : {}),
        ...(cta ? { call_to_action: { type: copy.cta, value: { link: card.link || copy.link } } } : {}),
      })),
    };
  }

  return {
    name: input.name,
    object_story_spec: storySpec,
    degrees_of_freedom_spec: {
      creative_features_spec: {
        standard_enhancements: {
          enroll_status: input.advantageCreativeOptout ? 'OPT_OUT' : 'OPT_IN',
        },
      },
    },
    ...(copy.url_tags ? { url_tags: copy.url_tags } : {}),
  };
}
