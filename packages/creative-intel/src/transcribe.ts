/** T-006-1: transcrição plugável. Sem provedor aprovado, `unavailable` visível. */
export interface TranscriptSegment {
  t0: number;
  t1: number;
  text: string;
}

export type TranscriptResult =
  | { status: 'ready'; segments: TranscriptSegment[]; provider: string; language: string }
  | { status: 'unavailable'; reason: string };

export interface Transcriber {
  transcribe(audioWav: Uint8Array, language: string): Promise<TranscriptResult>;
}

/** Nenhum provedor aprovado no projeto: registra ausência, nunca finge. */
export function unavailableTranscriber(reason: string): Transcriber {
  return {
    async transcribe() {
      return { status: 'unavailable', reason };
    },
  };
}
