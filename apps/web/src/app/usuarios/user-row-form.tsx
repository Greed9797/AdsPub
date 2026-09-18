"use client";

import { useMemo, useState, type FormEvent } from 'react';
import { Card, Field, inputClass } from '@/components/ui';
import {
  redefinirSenha,
  salvarUsuario,
  type SalvarUsuarioResult,
  type Usuario,
} from './actions';
import type { AdAccount, Role } from '@/lib/types';
import { Button } from '@astryxdesign/core/Button';

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
  const [state, setState] = useState<FormState>(null);
  const [saving, setSaving] = useState(false);
  const [resetState, setResetState] = useState<FormState>(null);
  const [resetting, setResetting] = useState(false);

  const assigned = useMemo(() => new Set(user.ad_account_ids), [user.ad_account_ids]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    setSaving(true);
    const result = await salvarUsuario(formData);
    setState(result);
    setSaving(false);
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
    <Card>
      <form onSubmit={onSubmit} className="space-y-3">
        <input type="hidden" name="user_id" value={user.id} />

        <Field label="Papel">
          <select
            name="role"
            defaultValue={user.role}
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

        <Field label="Status">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="active"
              value="1"
              defaultChecked={user.active}
              disabled={saving}
            />
            <span>{user.active ? 'Ativo' : 'Inativo'}</span>
          </label>
        </Field>

        <Field label="Contas atribuídas">
          <div className="max-h-44 space-y-2 overflow-auto rounded border border-[var(--color-border)] p-2">
            {accounts.length === 0 ? <p className="text-sm text-[var(--color-muted)]">Nenhuma conta cadastrada.</p> : null}
            {accounts.map((account) => (
              <label key={account.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
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

        <div className="flex items-center justify-between gap-2">
          <Button variant="primary" label={saving ? 'Salvando...' : 'Salvar'} type="submit" isDisabled={saving} />
          {state ? (
            'erro' in state ? (
              <span className="text-sm text-[var(--color-danger)]">{state.erro}</span>
            ) : (
              <span className="text-sm text-[var(--color-ok)]">Atualizado com sucesso.</span>
            )
          ) : null}
        </div>
      </form>

      <form onSubmit={onResetPassword} className="mt-4 space-y-3 border-t border-[var(--color-border)] pt-4">
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
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="secondary"
            label={resetting ? 'Redefinindo...' : 'Redefinir senha'}
            type="submit"
            isDisabled={resetting}
          />
          {resetState ? (
            'erro' in resetState ? (
              <span className="text-sm text-[var(--color-danger)]">{resetState.erro}</span>
            ) : (
              <span className="text-sm text-[var(--color-ok)]">Senha redefinida.</span>
            )
          ) : null}
        </div>
      </form>
    </Card>
  );
}
