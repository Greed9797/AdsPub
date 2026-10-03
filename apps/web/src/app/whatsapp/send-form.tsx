'use client';

import { useMemo, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button, Field, inputClass } from '@/components/ui';
import { enviarTemplateWhatsapp } from './actions';
import type { WhatsappTemplate } from './types';

export function SendForm({
  accountId,
  templates,
  displayPhone,
}: {
  accountId: string;
  templates: WhatsappTemplate[];
  displayPhone: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ to: '', template: '', language: 'pt_BR' });

  const approved = useMemo(
    () => templates.filter((item) => item.status === 'APPROVED'),
    [templates],
  );

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const template = String(data.get('template') ?? '');
    const chosen = templates.find((item) => item.name === template);
    setErro(null);
    setOk(false);
    setDraft({
      to: String(data.get('to') ?? ''),
      template,
      language: chosen?.language || String(data.get('language') ?? 'pt_BR'),
    });
    setOpen(true);
  };

  const confirm = () => {
    start(() => {
      void enviarTemplateWhatsapp(accountId, draft).then((result) => {
        setOpen(false);
        if ('erro' in result) {
          setErro(result.erro);
          return;
        }
        setOk(true);
        router.refresh();
      });
    });
  };

  return (
    <>
      <form onSubmit={onSubmit} className="ap-wa__form">
        <Field label="Telefone de destino" hint="DDI + número, só dígitos. Ex.: 5511999990000">
          <input name="to" className={inputClass} inputMode="tel" required />
        </Field>
        <Field label="Modelo aprovado">
          {approved.length > 0 ? (
            <select name="template" className={inputClass} required defaultValue="">
              <option value="" disabled>
                Escolher
              </option>
              {approved.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.name} · {item.language}
                </option>
              ))}
            </select>
          ) : (
            <input name="template" className={inputClass} required placeholder="pedido_pronto" />
          )}
        </Field>
        <input type="hidden" name="language" value="pt_BR" />
        {erro ? (
          <p role="alert" className="ap-note ap-wa__wide" data-tone="danger">
            {erro}
          </p>
        ) : null}
        {ok ? <p role="status" className="ap-note ap-wa__wide">Mensagem aceita pela Meta.</p> : null}
        <div className="ap-wa__wide">
          <Button
            variant="primary"
            label="Revisar envio"
            type="submit"
            isDisabled={pending}
          />
        </div>
      </form>
      <ConfirmDialog
        isOpen={open}
        title="Enviar modelo"
        confirmLabel={pending ? 'Enviando...' : 'Enviar'}
        onCancel={() => {
          if (!pending) setOpen(false);
        }}
        onConfirm={confirm}
      >
        <p>
          Enviar <strong>{draft.template}</strong> ({draft.language}) para <strong>{draft.to}</strong>
          {displayPhone ? ` a partir de ${displayPhone}` : ''}. A Meta só recebe o pedido depois desta confirmação.
        </p>
      </ConfirmDialog>
    </>
  );
}
