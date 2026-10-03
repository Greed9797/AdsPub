export interface LadoDaAlteracao {
  rotulo: 'Antes' | 'Depois';
  /** `null` quando o evento não guardou esse lado (criação não tem "antes"). */
  texto: string | null;
}

function formatar(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  return JSON.stringify(valor, null, 2);
}

/** O antes e o depois de um evento, cada um no seu bloco; lado vazio é omitido pela tela. */
export function ladosDaAlteracao(entry: { before: unknown; after: unknown }): LadoDaAlteracao[] {
  return [
    { rotulo: 'Antes', texto: formatar(entry.before) },
    { rotulo: 'Depois', texto: formatar(entry.after) },
  ];
}

export function temAlteracao(entry: { before: unknown; after: unknown }): boolean {
  return ladosDaAlteracao(entry).some((lado) => lado.texto !== null);
}
