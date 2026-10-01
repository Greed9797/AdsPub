'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@astryxdesign/core/Button';
import { Field, inputClass } from '@/components/ui';
import type { Client } from '@/lib/types';
import { conectarWhatsapp } from './actions';

export function ConnectForm({ clients }: { clients: Client[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [token, setToken] = useState('');

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setErro(null);
    setOk(false);
    start(() => {
      void conectarWhatsapp({
        client_id: String(data.get('client_id') ?? ''),
        waba_id: String(data.get('waba_id') ?? ''),
        phone_number_id: String(data.get('phone_number_id') ?? ''),
        display_name: String(data.get('display_name') ?? ''),
        token,
      }).then((result) => {
        if ('erro' in result) {
          setErro(result.erro);
          return;
        }
        setToken('');
        setOk(true);
        form.reset();
        router.refresh();
      });
    });
  };

  if (clients.length === 0) {
    return <p className="text-sm">Cadastre um cliente antes de conectar o número.</p>;
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
      <Field label="Cliente">
        <select name="client_id" className={inputClass} required defaultValue="">
          <option value="" disabled>
            Escolher
          </option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Nome de exibição" hint="Opcional. Se vazio, usa o nome verificado na Meta.">
        <input name="display_name" className={inputClass} maxLength={120} />
      </Field>
      <Field label="WABA id">
        <input name="waba_id" className={inputClass} inputMode="numeric" required />
      </Field>
      <Field label="Phone number id">
        <input name="phone_number_id" className={inputClass} inputMode="numeric" required />
      </Field>
      <Field label="Token do system user" hint="Guardado cifrado. Não volta para a tela." className="sm:col-span-2">
        <input
          name="token"
          className={inputClass}
          type="password"
          autoComplete="off"
          required
          minLength={20}
          value={token}
          onChange={(event) => setToken(event.target.value)}
        />
      </Field>
      {erro ? (
        <p role="alert" className="notice notice-error sm:col-span-2">
          {erro}
        </p>
      ) : null}
      {ok ? <p className="notice sm:col-span-2">Conta conectada.</p> : null}
      <div className="sm:col-span-2">
        <Button variant="primary" label={pending ? 'Conectando...' : 'Conectar conta'} type="submit" isDisabled={pending} />
      </div>
    </form>
  );
}
