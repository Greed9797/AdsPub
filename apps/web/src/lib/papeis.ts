import type { Role } from './types';

export interface Capacidade {
  texto: string;
  pode: boolean;
}

const TODOS: readonly Role[] = ['admin', 'coordinator', 'manager', 'viewer'];
const QUEM_PUBLICA: readonly Role[] = ['admin', 'coordinator', 'manager'];
const QUEM_ADMINISTRA_CONTAS: readonly Role[] = ['admin', 'coordinator'];
const SO_ADMIN: readonly Role[] = ['admin'];

/** O que cada papel pode, espelhando o que as rotas e as ações do servidor realmente exigem. */
const CAPACIDADES: ReadonlyArray<{ texto: string; papeis: readonly Role[] }> = [
  { texto: 'Ver lotes, criativos e performance', papeis: TODOS },
  { texto: 'Criar, validar e publicar lotes; enviar criativos; gerar relatórios; usar o WhatsApp', papeis: QUEM_PUBLICA },
  { texto: 'Ver auditoria e editar padrões de contas e clientes', papeis: QUEM_ADMINISTRA_CONTAS },
  { texto: 'Criar usuários, trocar papéis e trocar tokens', papeis: SO_ADMIN },
];

export function capacidadesDoPapel(papel: Role): Capacidade[] {
  return CAPACIDADES.map((capacidade) => ({ texto: capacidade.texto, pode: capacidade.papeis.includes(papel) }));
}

/** Admin e coordenador veem todas as contas; os demais, só as atribuídas. */
export function veTodasAsContas(papel: Role): boolean {
  return papel === 'admin' || papel === 'coordinator';
}

export const ROTULO_DO_PAPEL: Readonly<Record<Role, string>> = {
  admin: 'Administrador',
  coordinator: 'Coordenador',
  manager: 'Gerente',
  viewer: 'Leitor',
};
