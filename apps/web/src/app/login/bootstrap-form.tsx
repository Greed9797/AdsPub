'use client';

import { useActionState, useState } from 'react';

import { Button, Field, inputClass } from '@/components/ui';
import { criarAdminInicial } from './actions';

export function BootstrapForm() {
  const [state, action, pending] = useActionState(criarAdminInicial, null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <form action={action} className="ap-auth__form">
      <Field label="Seu nome">
        <input
          name="name"
          type="text"
          required
          autoComplete="name"
          disabled={pending}
          className={inputClass}
          value={name}
          onChange={(event) => setName(event.target.value)}
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
          value={email}
          onChange={(event) => setEmail(event.target.value)}
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
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>
      {state ? (
        <p role="alert" className="ap-note" data-tone="danger">
          {state.erro}
        </p>
      ) : null}
      <Button
        variant="primary"
        label={pending ? 'Criando...' : 'Criar administrador e entrar'}
        type="submit"
        isDisabled={pending}
        block
      />
    </form>
  );
}
