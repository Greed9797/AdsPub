'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, inputClass } from '@/components/ui';
import { criarTemplateWhatsapp } from './actions';

export function TemplateForm({ accountId }: { accountId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setErro(null);
    start(() => {
      void criarTemplateWhatsapp(accountId, {
        name: String(data.get('name') ?? ''),
        language: String(data.get('language') ?? 'pt_BR'),
        category: String(data.get('category') ?? 'UTILITY') as 'MARKETING' | 'UTILITY' | 'AUTHENTICATION',
        body: String(data.get('body') ?? ''),
      }).then((result) => {
        if ('erro' in result) {
          setErro(result.erro);
          return;
        }
        form.reset();
        router.refresh();
      });
    });
  };

  return (
    <form onSubmit={onSubmit} className="ap-wa__tpl">
      <div className="ap-wa__tpl-row">
        <Field label="Nome">
          <input name="name" className={inputClass} required placeholder="pedido_pronto" />
        </Field>
        <Field label="Idioma">
          <input name="language" className={inputClass} required defaultValue="pt_BR" />
        </Field>
        <Field label="Categoria">
          <select name="category" className={inputClass} defaultValue="UTILITY">
            <option value="UTILITY">Utilidade</option>
            <option value="MARKETING">Marketing</option>
            <option value="AUTHENTICATION">Autenticação</option>
          </select>
        </Field>
      </div>
      <Field label="Corpo" hint="A Meta analisa o modelo antes de liberar o envio.">
        <textarea name="body" className={inputClass} required rows={3} maxLength={1024} />
      </Field>
      {erro ? (
        <p role="alert" className="ap-note" data-tone="danger">
          {erro}
        </p>
      ) : null}
      <div>
        <Button variant="secondary" label={pending ? 'Enviando...' : 'Criar modelo'} type="submit" isDisabled={pending} />
      </div>
    </form>
  );
}
