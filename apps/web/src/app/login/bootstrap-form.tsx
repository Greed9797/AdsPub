"use client";

import { useActionState } from 'react';
import { Field, inputClass } from '@/components/ui';
import { Button } from '@astryxdesign/core/Button';
import { criarAdminInicial } from './actions';

export function BootstrapForm() {
  const [state, action, pending] = useActionState(criarAdminInicial, null);

  return (
    <form action={action} className="space-y-4">
      <Field label="Seu nome">
        <input
          name="name"
          type="text"
          required
          autoComplete="name"
          disabled={pending}
          className={inputClass}
        />
      </Field>
      <Field label="E-mail corporativo">
        <input
          name="email"
          type="email"
          required
          autoComplete="username"
          placeholder="voce@empresa.com.br"
          disabled={pending}
          className={inputClass}
        />
      </Field>
      <Field label="Senha (mínimo 12 caracteres)">
        <input
          name="password"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          disabled={pending}
          className={inputClass}
        />
      </Field>
      {state ? (
        <p role="alert" className="notice notice-error">
          {state.erro}
        </p>
      ) : null}
      <Button
        variant="primary"
        label={pending ? 'Criando...' : 'Criar administrador e entrar'}
        type="submit"
        isDisabled={pending}
      />
    </form>
  );
}
