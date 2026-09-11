"use client";

import { useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { inputClass, Field } from '@/components/ui';
import type { AdAccount } from '@/lib/types';
import type { AccountDefaultsInput, ActionResult } from './actions';
import { Button } from '@astryxdesign/core/Button';

interface AccountDefaultsFormProps {
  account: AdAccount;
  salvarDefaults: (accountId: string, payload: AccountDefaultsInput) => Promise<ActionResult>;
}

function isActionError(result: ActionResult): result is { erro: string } {
  return 'erro' in result;
}

export default function AccountDefaultsForm({ account, salvarDefaults }: AccountDefaultsFormProps) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState(account.client_id ?? '');
  const [defaultPageId, setDefaultPageId] = useState(account.default_page_id ?? '');
  const [defaultIgUserId, setDefaultIgUserId] = useState(account.default_ig_user_id ?? '');
  const [defaultPixelId, setDefaultPixelId] = useState(account.default_pixel_id ?? '');
  const [dailyCap, setDailyCap] = useState(
    account.daily_ad_cap === null ? '' : String(account.daily_ad_cap),
  );

  const [sucesso, setSucesso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setErro(null);
    setSucesso(null);

    startTransition(() => {
      void salvarDefaults(account.id, {
        client_id: clientId,
        default_page_id: defaultPageId,
        default_ig_user_id: defaultIgUserId,
        default_pixel_id: defaultPixelId,
        daily_ad_cap: dailyCap,
      }).then((result) => {
        if (isActionError(result)) {
          setErro(result.erro);
          return;
        }

        setSucesso('Defaults salvos com sucesso.');
        router.refresh();
      });
    });
  };

  return (
    <div>
      <Button variant="secondary" label={open ? 'Ocultar formulário' : 'Editar defaults'} onClick={() => setOpen((prev) => !prev)} />

      {open ? (
        <form
          onSubmit={onSubmit}
          className="mt-3 space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Cliente vinculado" hint="UUID do cliente. Vazio desvincula a conta.">
              <input
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                className={inputClass}
                placeholder="UUID do cliente"
              />
            </Field>

            <Field label="Página padrão" hint="ID da página usada nos anúncios.">
              <input
                value={defaultPageId}
                onChange={(event) => setDefaultPageId(event.target.value)}
                className={inputClass}
                placeholder="ID da página"
              />
            </Field>

            <Field label="Instagram padrão" hint="ID do usuário do Instagram vinculado.">
              <input
                value={defaultIgUserId}
                onChange={(event) => setDefaultIgUserId(event.target.value)}
                className={inputClass}
                placeholder="ID do Instagram"
              />
            </Field>

            <Field label="Pixel padrão" hint="ID do pixel usado no tracking.">
              <input
                value={defaultPixelId}
                onChange={(event) => setDefaultPixelId(event.target.value)}
                className={inputClass}
                placeholder="ID do pixel"
              />
            </Field>

            <Field
              label="Teto diário de anúncios"
              hint="Inteiro de 1 a 10.000. Vazio mantém o teto atual."
            >
              <input
                value={dailyCap}
                onChange={(event) => setDailyCap(event.target.value)}
                className={inputClass}
                inputMode="numeric"
                placeholder="Ex.: 50"
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" label={isPending ? 'Salvando...' : 'Salvar'} type="submit" isDisabled={isPending} />
            <Button variant="secondary" label="Fechar" isDisabled={isPending} onClick={() => setOpen(false)} />
          </div>

          {erro ? <p className="text-sm text-[var(--color-danger)]">{erro}</p> : null}
          {sucesso ? <p className="text-sm text-[var(--color-ok)]">{sucesso}</p> : null}
        </form>
      ) : null}
    </div>
  );
}
