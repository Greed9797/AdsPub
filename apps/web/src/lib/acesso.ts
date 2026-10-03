export type AbaDoAcesso = 'entrar' | 'primeiro';

export interface AbaInfo {
  id: AbaDoAcesso;
  rotulo: string;
}

/** "Primeiro acesso" só existe enquanto nenhum usuário tem senha (a API se desliga depois do 1º uso). */
export function abasDoAcesso(bootstrapDisponivel: boolean): AbaInfo[] {
  const entrar: AbaInfo = { id: 'entrar', rotulo: 'Entrar' };
  return bootstrapDisponivel ? [entrar, { id: 'primeiro', rotulo: 'Primeiro acesso' }] : [entrar];
}

/**
 * Sem pedido explícito, o primeiro acesso vem na frente quando está disponível:
 * é a única coisa que funciona num sistema sem nenhuma senha.
 */
export function abaAtiva(bootstrapDisponivel: boolean, pedida: string | undefined): AbaDoAcesso {
  if (!bootstrapDisponivel) return 'entrar';
  return pedida === 'entrar' ? 'entrar' : 'primeiro';
}
