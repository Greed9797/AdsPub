"use client";

import { useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { inputClass, Field } from '@/components/ui';
import type { Client } from '@/lib/types';
import type { ActionResult, CreateClientInput, UpdateClientInput } from './actions';
import { Button } from '@astryxdesign/core/Button';

interface CreateClientFormProps {
  mode: 'create';
  salvar: (payload: CreateClientInput) => Promise<ActionResult>;
}

interface EditClientFormProps {
  mode: 'edit';
  client: Client;
  salvar: (clientId: string, payload: UpdateClientInput) => Promise<ActionResult>;
}

type ClientFormProps = CreateClientFormProps | EditClientFormProps;

type UtmParseResult =
  | { ok: true; value: Record<string, string> }
  | { ok: false; erro: string };

const DEFAULT_NAMING_TEMPLATE = '{cliente}_{objetivo}_{data:YYYYMMDD}_{criativo}_{formato}_{v}';

function parseTextLines(value: string): string[] {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseDefaultUtm(input: string): UtmParseResult {
  const result: Record<string, string> = {};

  for (const line of parseTextLines(input)) {
    const separator = line.indexOf('=');
    if (separator <= 0) {
      return { ok: false, erro: `Linha inválida em UTM: ${line}. Use chave=valor.` };
    }

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();

    if (key.length === 0) {
      return { ok: false, erro: `Linha inválida em UTM: ${line}. A chave não pode ficar vazia.` };
    }

    result[key] = value;
  }

  return { ok: true, value: result };
}

function isActionError(result: ActionResult): result is { erro: string } {
  return 'erro' in result;
}

export default function ClientForm(props: ClientFormProps) {
  const router = useRouter();

  const isCreate = props.mode === 'create';
  const client = isCreate ? undefined : props.client;

  const [open, setOpen] = useState(isCreate);
  const [nome, setNome] = useState(client?.name ?? '');
  const [policyMode, setPolicyMode] = useState<'warn' | 'block'>(
    client?.policy_mode ?? 'warn',
  );
  const [namingTemplate, setNamingTemplate] = useState(
    client?.naming_template ?? DEFAULT_NAMING_TEMPLATE,
  );
  const [tone, setTone] = useState(client?.voice_profile.tone ?? '');
  const [audience, setAudience] = useState(client?.voice_profile.audience ?? '');
  const [forbiddenTerms, setForbiddenTerms] = useState(
    (client?.voice_profile.forbidden_terms ?? []).join('\n'),
  );
  const [allowedClaims, setAllowedClaims] = useState(
    (client?.voice_profile.allowed_claims ?? []).join('\n'),
  );
  const [examples, setExamples] = useState((client?.voice_profile.examples ?? []).join('\n'));
  const [defaultUtm, setDefaultUtm] = useState(
    Object.entries(client?.default_utm ?? {})
      .map(([key, value]) => `${key}=${value}`)
      .join('\n'),
  );
  const [landingDomains, setLandingDomains] = useState(
    (client?.landing_domains ?? []).join('\n'),
  );
  const [advantageOptOut, setAdvantageOptOut] = useState(
    client?.advantage_creative_optout ?? true,
  );

  const [isPending, startTransition] = useTransition();
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setErro(null);
    setSucesso(null);

    if (nome.trim().length === 0) {
      setErro('Informe o nome do cliente.');
      return;
    }

    const parsedUtm = parseDefaultUtm(defaultUtm);
    if (!parsedUtm.ok) {
      setErro(parsedUtm.erro);
      return;
    }

    const payload = {
      name: nome.trim(),
      voice_profile: {
        tone: tone.trim(),
        audience: audience.trim(),
        forbidden_terms: parseTextLines(forbiddenTerms),
        allowed_claims: parseTextLines(allowedClaims),
        examples: parseTextLines(examples),
      },
      naming_template: namingTemplate.trim() || DEFAULT_NAMING_TEMPLATE,
      default_utm: parsedUtm.value,
      policy_mode: policyMode,
      landing_domains: parseTextLines(landingDomains),
      advantage_creative_optout: advantageOptOut,
    };

    startTransition(() => {
      let resultPromise: Promise<ActionResult>;

      if (props.mode === 'create') {
        resultPromise = props.salvar(payload);
      } else {
        resultPromise = props.salvar(props.client.id, payload);
      }

      void resultPromise.then((result) => {
        if (isActionError(result)) {
          setErro(result.erro);
          return;
        }

        setSucesso(props.mode === 'create' ? 'Cliente criado com sucesso.' : 'Cliente atualizado com sucesso.');
        router.refresh();

        if (props.mode === 'create') {
          setNome('');
          setPolicyMode('warn');
          setNamingTemplate(DEFAULT_NAMING_TEMPLATE);
          setTone('');
          setAudience('');
          setForbiddenTerms('');
          setAllowedClaims('');
          setExamples('');
          setDefaultUtm('');
          setLandingDomains('');
          setAdvantageOptOut(true);
        } else {
          setOpen(false);
        }
      });
    });
  };

  const submitLabel = isCreate ? 'Criar cliente' : 'Salvar alterações';

  return (
    <div>
      <Button variant="secondary" label={isCreate ? 'Novo cliente' : open ? 'Ocultar formulário' : 'Editar cliente'} onClick={() => setOpen((prev) => !prev)} />

      {open ? (
        <form
          onSubmit={submit}
          className="mt-3 space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome">
              <input
                value={nome}
                onChange={(event) => setNome(event.target.value)}
                className={inputClass}
                placeholder="Nome do cliente"
              />
            </Field>

            <Field label="Política de validação">
              <select
                className={inputClass}
                value={policyMode}
                onChange={(event) =>
                  setPolicyMode(event.target.value === 'block' ? 'block' : 'warn')
                }
              >
                <option value="warn">warn</option>
                <option value="block">block</option>
              </select>
            </Field>

            <div className="sm:col-span-2">
              <Field label="Template de nomeação">
                <input
                  value={namingTemplate}
                  onChange={(event) => setNamingTemplate(event.target.value)}
                  className={inputClass}
                  placeholder="{cliente}_{objetivo}_{data:YYYYMMDD}_{criativo}_{formato}_{v}"
                />
              </Field>
            </div>

            <div className="sm:col-span-2">
              <Field label="Tom">
                <input
                  value={tone}
                  onChange={(event) => setTone(event.target.value)}
                  className={inputClass}
                  placeholder="Tom de comunicação"
                />
              </Field>
            </div>

            <div className="sm:col-span-2">
              <Field label="Público">
                <input
                  value={audience}
                  onChange={(event) => setAudience(event.target.value)}
                  className={inputClass}
                  placeholder="Público-alvo"
                />
              </Field>
            </div>

            <Field label="Termos proibidos (um por linha)">
              <textarea
                value={forbiddenTerms}
                onChange={(event) => setForbiddenTerms(event.target.value)}
                rows={3}
                className={inputClass}
              />
            </Field>

            <Field label="Claims permitidos (um por linha)">
              <textarea
                value={allowedClaims}
                onChange={(event) => setAllowedClaims(event.target.value)}
                rows={3}
                className={inputClass}
              />
            </Field>

            <Field label="Exemplos (um por linha)">
              <textarea
                value={examples}
                onChange={(event) => setExamples(event.target.value)}
                rows={3}
                className={inputClass}
              />
            </Field>

            <div className="sm:col-span-2">
              <Field label="Default UTM (chave=valor, um por linha)">
                <textarea
                  value={defaultUtm}
                  onChange={(event) => setDefaultUtm(event.target.value)}
                  rows={4}
                  className={inputClass}
                />
              </Field>
            </div>

            <div className="sm:col-span-2">
              <Field label="Domínios (um por linha)">
                <textarea
                  value={landingDomains}
                  onChange={(event) => setLandingDomains(event.target.value)}
                  rows={3}
                  className={inputClass}
                />
              </Field>
            </div>

            <label className="flex items-center gap-2 sm:col-span-2 text-sm">
              <input
                type="checkbox"
                checked={advantageOptOut}
                onChange={(event) => setAdvantageOptOut(event.target.checked)}
              />
              <span>Desativar Advantage+ Creative?</span>
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="primary" label={isPending ? 'Salvando...' : submitLabel} type="submit" isDisabled={isPending} />

            {isCreate ? null : (
              <Button variant="secondary" label="Fechar" isDisabled={isPending} onClick={() => setOpen(false)} />
            )}
          </div>

          {erro ? <p className="text-sm text-[var(--color-danger)]">{erro}</p> : null}
          {sucesso ? <p className="text-sm text-[var(--color-ok)]">{sucesso}</p> : null}
        </form>
      ) : null}
    </div>
  );
}
