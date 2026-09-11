"use client";

import { useMemo, useState, type FormEvent } from 'react';
import { Card, Field, inputClass } from '@/components/ui';
import { salvarUsuario, type SalvarUsuarioResult, type Usuario } from './actions';
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

  const assigned = useMemo(() => new Set(user.ad_account_ids), [user.ad_account_ids]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    setSaving(true);
    const result = await salvarUsuario(formData);
    setState(result);
    setSaving(false);
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
    </Card>
  );
}
