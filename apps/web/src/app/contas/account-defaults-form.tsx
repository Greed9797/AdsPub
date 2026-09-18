'use client';

import { useId, useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { inputClass, Field } from '@/components/ui';
import type { AdAccount, Client } from '@/lib/types';
import { Dialog } from '@astryxdesign/core/Dialog';
import type { AccountDefaultsInput, ActionResult } from './actions';
import { Button } from '@astryxdesign/core/Button';

interface AccountDefaultsFormProps {
  account: AdAccount;
  clients: Client[];
  salvarDefaults: (accountId: string, payload: AccountDefaultsInput) => Promise<ActionResult>;
}

function isActionError(result: ActionResult): result is { erro: string } {
  return 'erro' in result;
}

export default function AccountDefaultsForm({
  account,
  clients,
  salvarDefaults,
}: AccountDefaultsFormProps) {
  const router = useRouter();
  const titleId = useId();

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

    startTransition(async () => {
      const result = await salvarDefaults(account.id, {
        client_id: clientId,
        default_page_id: defaultPageId,
        default_ig_user_id: defaultIgUserId,
        default_pixel_id: defaultPixelId,
        daily_ad_cap: dailyCap,
      });
      if (isActionError(result)) {
        setErro(result.erro);
        return;
      }

      setSucesso('Padrões de publicação salvos.');
      router.refresh();
    });
  };

  return (
    <div>
      <Button variant="secondary" label="Editar padrões" onClick={() => setOpen(true)} />
      <Dialog
        isOpen={open}
        onOpenChange={(next) => {
          if (!isPending) setOpen(next);
        }}
        purpose="form"
        width={640}
        padding={5}
        aria-labelledby={titleId}
      >
        <h2 id={titleId} className="text-lg font-semibold">
          Padrões de publicação
        </h2>
        <p className="mt-1 mb-5 text-sm text-[var(--color-muted)]">{account.name}</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <fieldset disabled={isPending} className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Cliente vinculado"
              hint="Escolha o cliente desta conta. Sem cliente desvincula a conta."
            >
              <select
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                className={inputClass}
              >
                <option value="">Sem cliente vinculado</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
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
          </fieldset>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              label={isPending ? 'Salvando...' : 'Salvar'}
              type="submit"
              isDisabled={isPending}
            />
            <Button
              variant="secondary"
              label="Fechar"
              isDisabled={isPending}
              onClick={() => setOpen(false)}
            />
          </div>

          {erro ? (
            <p role="alert" className="notice notice-error">
              {erro}
            </p>
          ) : null}
          {sucesso ? (
            <p role="status" className="text-sm text-[var(--color-ok)]">
              {sucesso}
            </p>
          ) : null}
        </form>
      </Dialog>
    </div>
  );
}
