"use client";

import { useActionState } from 'react';
import { Field, inputClass } from '@/components/ui';
import { Button } from '@astryxdesign/core/Button';
import { entrarComSenha } from './actions';

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(entrarComSenha, null);

  return (
    <form action={action} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
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
      <Field label="Senha">
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
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
        label={pending ? 'Entrando...' : 'Entrar'}
        type="submit"
        isDisabled={pending}
      />
    </form>
  );
}
