'use client';

import { useId, useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Dialog, Field, inputClass } from '@/components/ui';
import type { Client } from '@/lib/types';
import type { ActionResult, CreateClientInput, UpdateClientInput } from './actions';

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

type UtmParseResult = { ok: true; value: Record<string, string> } | { ok: false; erro: string };

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
  const titleId = useId();

  const isCreate = props.mode === 'create';
  const client = isCreate ? undefined : props.client;

  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState(client?.name ?? '');
  const [policyMode, setPolicyMode] = useState<'warn' | 'block'>(client?.policy_mode ?? 'warn');
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
  const [landingDomains, setLandingDomains] = useState((client?.landing_domains ?? []).join('\n'));
  const [advantageOptOut, setAdvantageOptOut] = useState(client?.advantage_creative_optout ?? true);

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

    startTransition(async () => {
      const result =
        props.mode === 'create'
          ? await props.salvar(payload)
          : await props.salvar(props.client.id, payload);
      if (isActionError(result)) {
        setErro(result.erro);
        return;
      }
      setSucesso(props.mode === 'create' ? 'Cliente criado.' : 'Cliente atualizado.');
      router.refresh();
      setOpen(false);
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
      }
    });
  };

  const submitLabel = isCreate ? 'Criar cliente' : 'Salvar alterações';

  return (
    <div>
      <Button
        variant={isCreate ? 'primary' : 'secondary'}
        label={isCreate ? 'Novo cliente' : 'Editar cliente'}
        onClick={() => setOpen(true)}
      />
      {sucesso ? (
        <p role="status" className="ap-t-small ap-clientes__ok">
          {sucesso}
        </p>
      ) : null}
      <Dialog
        isOpen={open}
        onOpenChange={(next) => {
          if (!isPending) setOpen(next);
        }}
        placement="side"
        width={640}
        aria-labelledby={titleId}
      >
        <h2 id={titleId} className="ap-t-title-m ap-ficha__h">
          {isCreate ? 'Novo cliente' : `Editar ${client?.name}`}
        </h2>
        <p className="ap-t-small ap-ficha__sub">
          Identidade, linguagem e padrões usados na criação dos anúncios.
        </p>
        <form onSubmit={submit} className="ap-ficha">
          <fieldset disabled={isPending} className="ap-ficha__fields">
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
                <option value="warn">Avisar e permitir revisão</option>
                <option value="block">Bloquear violações</option>
              </select>
            </Field>

            <div>
              <Field
                label="Padrão dos nomes"
                hint="Variáveis entre chaves são preenchidas automaticamente."
              >
                <input
                  value={namingTemplate}
                  onChange={(event) => setNamingTemplate(event.target.value)}
                  className={inputClass}
                  placeholder="{cliente}_{objetivo}_{data:YYYYMMDD}_{criativo}_{formato}_{v}"
                />
              </Field>
            </div>

            <div>
              <Field label="Tom de voz">
                <input
                  value={tone}
                  onChange={(event) => setTone(event.target.value)}
                  className={inputClass}
                  placeholder="Tom de comunicação"
                />
              </Field>
            </div>

            <div>
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

            <Field label="Promessas permitidas (uma por linha)">
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

            <div>
              <Field
                label="UTMs padrão"
                hint="Uma chave=valor por linha. Ex.: utm_source=instagram."
              >
                <textarea
                  value={defaultUtm}
                  onChange={(event) => setDefaultUtm(event.target.value)}
                  rows={4}
                  className={inputClass}
                />
              </Field>
            </div>

            <div>
              <Field label="Domínios (um por linha)">
                <textarea
                  value={landingDomains}
                  onChange={(event) => setLandingDomains(event.target.value)}
                  rows={3}
                  className={inputClass}
                />
              </Field>
            </div>

            <label className="ap-clientes__check ap-t-body">
              <input
                type="checkbox"
                className="ap-check"
                checked={advantageOptOut}
                onChange={(event) => setAdvantageOptOut(event.target.checked)}
              />
              <span>Desativar melhorias automáticas Advantage+ Creative</span>
            </label>
          </fieldset>

          <div className="ap-ficha__foot">
            <span />
            <div className="ap-ficha__actions">
            <Button
              variant="secondary"
              label="Fechar"
              isDisabled={isPending}
              onClick={() => setOpen(false)}
            />
            <Button
              variant="primary"
              label={isPending ? 'Salvando...' : submitLabel}
              type="submit"
              isDisabled={isPending}
            />
            </div>
          </div>
          {erro ? (
            <p role="alert" className="ap-note" data-tone="danger">
              {erro}
            </p>
          ) : null}
        </form>
      </Dialog>
    </div>
  );
}
