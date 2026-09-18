"use client";

import { useState, type FormEvent } from 'react';
import { Card, Field, inputClass } from '@/components/ui';
import { criarUsuario, type SalvarUsuarioResult } from './actions';
import type { Role } from '@/lib/types';
import { Button } from '@astryxdesign/core/Button';

const roles: Array<{ value: Role; label: string }> = [
  { value: 'admin', label: 'Admin' },
  { value: 'coordinator', label: 'Coordenador' },
  { value: 'manager', label: 'Gerente' },
  { value: 'viewer', label: 'Visualizador' },
];

export function UserCreateForm() {
  const [state, setState] = useState<SalvarUsuarioResult | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    setSaving(true);
    const result = await criarUsuario(formData);
    setState(result);
    if ('sucesso' in result) event.currentTarget.reset();
    setSaving(false);
  }

  return (
    <Card title="Novo usuário">
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <Field label="E-mail corporativo">
          <input
            name="email"
            type="email"
            required
            autoComplete="off"
            disabled={saving}
            className={inputClass}
          />
        </Field>
        <Field label="Nome">
          <input name="name" type="text" required disabled={saving} className={inputClass} />
        </Field>
        <Field label="Papel">
          <select name="role" defaultValue="manager" disabled={saving} className={inputClass} required>
            {roles.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Senha temporária (mínimo 12 caracteres)">
          <input
            name="password"
            type="password"
            minLength={12}
            required
            autoComplete="new-password"
            disabled={saving}
            className={inputClass}
          />
        </Field>
        <div className="flex items-center gap-2 sm:col-span-2">
          <Button
            variant="primary"
            label={saving ? 'Criando...' : 'Criar usuário'}
            type="submit"
            isDisabled={saving}
          />
          {state ? (
            'erro' in state ? (
              <span className="text-sm text-[var(--color-danger)]">{state.erro}</span>
            ) : (
              <span className="text-sm text-[var(--color-ok)]">Usuário criado.</span>
            )
          ) : null}
        </div>
      </form>
    </Card>
  );
}
