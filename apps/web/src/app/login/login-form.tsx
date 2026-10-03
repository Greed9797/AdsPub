'use client';

import { useActionState, useState } from 'react';

import { Button, Field, inputClass } from '@/components/ui';
import { entrarComSenha } from './actions';

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(entrarComSenha, null);
  // Controlados: o React 19 limpa os campos não controlados quando a ação termina,
  // e quem errou a senha não deve digitar o e-mail de novo.
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <form action={action} className="ap-auth__form">
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
          value={email}
          onChange={(event) => setEmail(event.target.value)}
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
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>
      {state ? (
        <p role="alert" className="ap-note" data-tone="danger">
          {state.erro}
        </p>
      ) : null}
      <Button variant="primary" label={pending ? 'Entrando...' : 'Entrar'} type="submit" isDisabled={pending} block />
    </form>
  );
}
