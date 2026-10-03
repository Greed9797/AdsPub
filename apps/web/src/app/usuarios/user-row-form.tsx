"use client";

import { useId, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Dialog, Field, inputClass } from '@/components/ui';
import { capacidadesDoPapel, veTodasAsContas } from '@/lib/papeis';
import {
  redefinirSenha,
  salvarUsuario,
  type SalvarUsuarioResult,
  type Usuario,
} from './actions';
import type { AdAccount, Role } from '@/lib/types';

type UserRowFormProps = {
  user: Usuario;
  accounts: AdAccount[];
};

type FormState = SalvarUsuarioResult | null;

const roles: Array<{ value: Role; label: string }> = [
  { value: 'admin', label: 'Admin' },
  { value: 'coordinator', label: 'Coordenador' },
  { value: 'manager', label: 'Gerente' },
  { value: 'viewer', label: 'Visualizador' },
];

export function UserRowForm({ user, accounts }: UserRowFormProps) {
  const router = useRouter();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [papel, setPapel] = useState<Role>(user.role);
  const [state, setState] = useState<FormState>(null);
  const [saving, setSaving] = useState(false);
  const [resetState, setResetState] = useState<FormState>(null);
  const [resetting, setResetting] = useState(false);

  const assigned = useMemo(() => new Set(user.ad_account_ids), [user.ad_account_ids]);
  const rotuloDoPapel = roles.find((role) => role.value === papel)?.label ?? papel;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    setSaving(true);
    const result = await salvarUsuario(formData);
    setState(result);
    setSaving(false);
    if ('sucesso' in result) router.refresh();
  }

  async function onResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    setResetting(true);
    const result = await redefinirSenha(formData);
    setResetState(result);
    if ('sucesso' in result) event.currentTarget.reset();
    setResetting(false);
  }

  return (
    <div>
      <Button variant="secondary" size="sm" label="Editar usuário" onClick={() => setOpen(true)} />
      <Dialog
        isOpen={open}
        onOpenChange={(next) => {
          if (!saving && !resetting) setOpen(next);
        }}
        placement="side"
        width={560}
        aria-labelledby={titleId}
      >
        <div className="ap-ficha">
          <header className="ap-ficha__head">
            <div>
              <p className="ap-t-ref ap-ficha__ref">Ficha do usuário</p>
              <h2 id={titleId} className="ap-t-title-m">
                {user.name || user.email}
              </h2>
              <p className="ap-t-small ap-ficha__name">{user.email}</p>
            </div>
            <Button variant="secondary" size="sm" label="Fechar" onClick={() => setOpen(false)} />
          </header>

          <form onSubmit={onSubmit} className="ap-ficha__fields">
            <input type="hidden" name="user_id" value={user.id} />

            <Field label="Papel">
              <select
                name="role"
                value={papel}
                onChange={(event) => setPapel(event.target.value as Role)}
                disabled={saving}
                className={inputClass}
                required
              >
                {roles.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </Field>

            <section className="ap-papel" aria-label={`O que ${rotuloDoPapel} pode`}>
              <p className="ap-t-label">O que um {rotuloDoPapel.toLowerCase()} pode</p>
              <ul>
                {capacidadesDoPapel(papel).map((capacidade) => (
                  <li key={capacidade.texto} data-pode={capacidade.pode ? 'true' : 'false'} className="ap-t-small">
                    <span aria-hidden="true">{capacidade.pode ? '✓' : '✕'}</span>
                    <span>
                      {capacidade.texto}
                      <span className="ap-papel__sr"> — {capacidade.pode ? 'pode' : 'não pode'}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <Field label="Status">
              <label className="ap-usuarios__check ap-t-body">
                <input
                  type="checkbox"
                  className="ap-check"
                  name="active"
                  value="1"
                  defaultChecked={user.active}
                  disabled={saving}
                />
                <span>{user.active ? 'Ativo' : 'Inativo'}</span>
              </label>
            </Field>

            <Field label="Contas atribuídas" hint={veTodasAsContas(papel) ? 'Este papel vê todas as contas, com ou sem atribuição.' : undefined}>
              <div className="ap-usuarios__contas">
                {accounts.length === 0 ? <p className="ap-t-small ap-passos__dica">Nenhuma conta cadastrada.</p> : null}
                {accounts.map((account) => (
                  <label key={account.id} className="ap-usuarios__check ap-t-body">
                    <input
                      type="checkbox"
                      className="ap-check"
                      name="ad_account_ids"
                      value={account.id}
                      defaultChecked={assigned.has(account.id)}
                      disabled={saving}
                    />
                    <span>{account.name}</span>
                  </label>
                ))}
              </div>
            </Field>

            <div className="ap-usuarios__acoes">
              <Button variant="primary" label={saving ? 'Salvando...' : 'Salvar'} type="submit" isDisabled={saving} />
              {state ? (
                'erro' in state ? (
                  <span role="alert" className="ap-note" data-tone="danger">
                    {state.erro}
                  </span>
                ) : (
                  <span role="status" className="ap-note">
                    Atualizado com sucesso.
                  </span>
                )
              ) : null}
            </div>
          </form>

          <form onSubmit={onResetPassword} className="ap-ficha__fields ap-usuarios__senha">
            <input type="hidden" name="user_id" value={user.id} />
            <Field label="Nova senha (mínimo 12 caracteres)">
              <input
                name="password"
                type="password"
                minLength={12}
                required
                autoComplete="new-password"
                disabled={resetting}
                className={inputClass}
              />
            </Field>
            <div className="ap-usuarios__acoes">
              <Button
                variant="secondary"
                label={resetting ? 'Redefinindo...' : 'Redefinir senha'}
                type="submit"
                isDisabled={resetting}
              />
              {resetState ? (
                'erro' in resetState ? (
                  <span role="alert" className="ap-note" data-tone="danger">
                    {resetState.erro}
                  </span>
                ) : (
                  <span role="status" className="ap-note">
                    Senha redefinida.
                  </span>
                )
              ) : null}
            </div>
          </form>
        </div>
      </Dialog>
    </div>
  );
}
